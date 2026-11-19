import type { LiveCandidate, LivePhase, LivePlace, LiveStatus } from './protocol'

/**
 * 롤러 회전 일정(Mock 기본 연출값). 위치는 회전 누적 시간만으로 계산하므로
 * 새로고침·프레임 저하·일시정지 후에도 모든 화면이 같은 칸을 보여 준다.
 * 실제 공개 시점은 서버가 REVEALING을 보내는 순간이며, 늦어지면 마지막 감속 속도로 계속 넘어간다.
 */
export const SPIN = {
  /** 0~0.8초: 조명 순차 점등, 회전 시작 */
  upMs: 800,
  /** 0.8~3.5초: 고속 회전 */
  fastUntilMs: 3500,
  /** 3.5~6.5초: 감속. 이후 공개를 기다리며 한 칸씩 넘어간다 */
  decelUntilMs: 6500,
  /** 초당 칸 수 */
  max: 18,
  crawl: 1.6,
} as const
/** 당첨 강조 시간. 1등은 조금 더 길고 크게 */
export const HIGHLIGHT_MS: Readonly<Record<LivePlace, number>> = { 1: 2800, 2: 2200, 3: 2200 }
/** 강조가 끝난 뒤 닉네임 카드가 결과판으로 날아가는 시간 */
export const FLY_MS = 900
/** 빈 슬롯은 짧게 멈춰 보여 주고 결과판에 바로 반영한다 */
export const EMPTY_HOLD_MS = 700
/** 빈 슬롯 공개 시 빠른 정지 목표 시간 */
const QUICK_STOP_MS = 900
export const REEL_CAP = 240
export const EMPTY_LABEL = '당첨자 없음'
export const PLACEHOLDER_LABEL = '· · ·'

/** 모든 화면이 같은 회전 순서를 보도록 시드 고정 난수를 쓴다. 당첨 결정에는 쓰지 않는다. */
export function seededRandom(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * 응모권 수에 비례한 연출용 닉네임 목록. 이미 발표된 당첨자는 뺀다.
 * 응모권이 많아도 cap 안에서 비율만 유지하며, 인접한 같은 이름은 가능한 한 떨어뜨린다.
 */
export function buildReel(candidates: readonly LiveCandidate[], exclude: ReadonlySet<string>, seed: number, cap = REEL_CAP) {
  const pool = candidates.filter(c => !exclude.has(c.nickname))
  if (!pool.length) return []
  const total = pool.reduce((sum, c) => sum + c.tickets, 0)
  const scale = Math.min(1, Math.max(cap - pool.length, 0) / total)
  const reel: string[] = []
  for (const c of pool) for (let i = 0, n = 1 + Math.floor((c.tickets - 1) * scale); i < n; i++) reel.push(c.nickname)
  const random = seededRandom(seed)
  for (let i = reel.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [reel[i], reel[j]] = [reel[j]!, reel[i]!]
  }
  for (let i = 1; i < reel.length; i++) {
    if (reel[i] !== reel[i - 1]) continue
    const j = reel.findIndex((name, k) => k > i && name !== reel[i - 1])
    if (j > 0) [reel[i], reel[j]] = [reel[j]!, reel[i]!]
  }
  return reel
}

/** 회전 누적 시간(ms)의 롤러 위치(칸). 가속(2차) → 등속 → 감속(2차) → 느린 등속 */
export function spinPosition(ms: number) {
  const t = Math.max(0, ms) / 1000
  const U = SPIN.upMs / 1000, F = SPIN.fastUntilMs / 1000, E = SPIN.decelUntilMs / 1000, D = E - F
  const { max: M, crawl: c } = SPIN
  if (t <= U) return M * t ** 3 / (3 * U * U)
  const pU = M * U / 3
  if (t <= F) return pU + M * (t - U)
  const pF = pU + M * (F - U)
  if (t <= E) {
    const s = (t - F) / D
    return pF + c * (t - F) + (M - c) * D * (1 - (1 - s) ** 3) / 3
  }
  return pF + c * D + (M - c) * D / 3 + c * (t - E)
}

/** 초당 칸 수 */
export function spinSpeed(ms: number) {
  const t = Math.max(0, ms) / 1000
  const U = SPIN.upMs / 1000, F = SPIN.fastUntilMs / 1000, E = SPIN.decelUntilMs / 1000
  if (t <= U) return SPIN.max * (t / U) ** 2
  if (t <= F) return SPIN.max
  if (t <= E) return SPIN.crawl + (SPIN.max - SPIN.crawl) * (1 - (t - F) / (E - F)) ** 2
  return SPIN.crawl
}

/**
 * 공개 후 착지 계획. 공개 순간의 회전 누적 시간만으로 정하므로 모든 화면에서 같다.
 * - 당첨자: 감속이 끝난 뒤(이미 끝났으면 바로) 다음 정렬 칸을 당첨자 칸으로 정하고 마지막 한 칸을 넘긴다.
 * - 빈 슬롯: 오래 돌리지 않고 약 0.9초 안에 '당첨자 없음' 칸에 멈춘다.
 */
export interface RevealPlan {
  kind: 'crawl' | 'quick'
  /** 공개 순간의 회전 누적 시간 */
  fromMs: number
  from: number
  speed: number
  /** 착지 칸. 이 칸에만 서버가 공개한 결과를 놓는다 */
  target: number
  /** REVEALING 시작부터 착지까지(ms) */
  landAfterMs: number
}

export function planReveal(spinMs: number, empty: boolean): RevealPlan {
  if (empty) {
    const from = spinPosition(spinMs), speed = Math.max(spinSpeed(spinMs), 4)
    const target = Math.max(Math.floor(from) + 1, Math.ceil(from + speed * QUICK_STOP_MS / 3000))
    return { kind: 'quick', fromMs: spinMs, from, speed, target, landAfterMs: 3000 * (target - from) / speed }
  }
  const startMs = Math.max(spinMs, SPIN.decelUntilMs)
  const p0 = spinPosition(startMs)
  const target = Math.floor(p0) + (p0 - Math.floor(p0) < .3 ? 1 : 2)
  return { kind: 'crawl', fromMs: spinMs, from: spinPosition(spinMs), speed: spinSpeed(spinMs), target,
    landAfterMs: startMs - spinMs + (target - p0) / SPIN.crawl * 1000 }
}

/** 공개 후 elapsed(ms)의 정렬 전 위치와 속도 */
export function revealMotion(plan: RevealPlan, elapsed: number) {
  if (elapsed >= plan.landAfterMs) return { position: plan.target, speed: 0 }
  if (plan.kind === 'crawl') {
    const ms = plan.fromMs + Math.max(0, elapsed)
    return { position: spinPosition(ms), speed: spinSpeed(ms) }
  }
  const u = Math.max(0, elapsed) / plan.landAfterMs
  return { position: plan.from + (plan.target - plan.from) * (1 - (1 - u) ** 3),
    speed: (plan.target - plan.from) * 3 * (1 - u) ** 2 / (plan.landAfterMs / 1000) }
}

function backOut(x: number) {
  const c1 = 1.6, c3 = c1 + 1
  return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2
}

/**
 * 기계식 롤러 정렬. 느려질수록 칸 사이에 잠시 머물렀다가 '탁' 넘어가며 살짝 튕긴다.
 * 빠를 때는 연속 이동이고, 초당 9칸에서 3칸 사이에서 점점 정렬 느낌이 강해진다.
 */
export function detent(position: number, speed: number) {
  const strength = Math.min(Math.max((9 - speed) / 6, 0), 1)
  if (!strength) return position
  const n = Math.floor(position), f = position - n, hold = .45
  const snapped = f < hold ? 0 : backOut((f - hold) / (1 - hold))
  return n + f + (snapped - f) * strength
}

/** 착지 직후 가벼운 반동 */
export function bounce(sinceLanding: number) {
  if (sinceLanding >= 600) return 0
  return -.09 * Math.exp(-sinceLanding / 150) * Math.sin(sinceLanding / 48)
}

export type ReelMode = 'idle' | 'spin' | 'paused' | 'landing' | 'landed' | 'complete'

export interface DirectorInput {
  phase: LivePhase | null
  /** 행사·슬롯이 바뀌면 회전 목록을 새로 만든다. */
  slotKey: string
  seed: number
  place: LivePlace | null
  candidates: readonly LiveCandidate[]
  exclude: ReadonlySet<string>
  /** 현재 슬롯이 서버에서 공개됐을 때만 값이 있다. null은 빈 슬롯. */
  result: string | null | undefined
  spinElapsedMs: number
  /** 현재 단계 시작 후 경과 시간(서버 시계 기준) */
  phaseElapsedMs: number
}

export interface ReelFrame {
  mode: ReelMode
  /** 화면에 그릴 위치(정렬·반동 포함) */
  position: number
  /** 정렬 전 위치. 바퀴 회전과 조명 순서에 쓴다 */
  base: number
  speed: number
  /** 회전 누적 시간(공개 후 포함). 일시정지 중에는 멈춘다 */
  spinMs: number
  place: LivePlace | null
  result: string | null | undefined
  /** 착지 칸. 착지 계획이 없으면 null */
  target: number | null
  /** 착지 후 경과(ms). 착지 전이면 -1 */
  sinceLanding: number
  /** 0~1. 멈춘 직후 1에서 시작해 사라진다. 빈 슬롯은 0 */
  highlight: number
  /** 결과판으로 날아가는 진행도 0~1, 비행 중이 아니면 -1 */
  fly: number
  /** 현재 슬롯이 결과판에 반영됐는지 */
  filled: boolean
  /** 결과판 반영 직후 깜빡임 0~1 */
  fillFlash: number
}

/** 결과판 반영 시점(착지 후 ms) */
export const fillDelay = (place: LivePlace, empty: boolean) => empty ? EMPTY_HOLD_MS : HIGHLIGHT_MS[place] + FLY_MS

/**
 * 서버 상태와 경과 시간만으로 롤러 프레임을 계산한다. 이전 프레임에 의존하지 않으므로
 * 늦게 들어온 화면도 같은 시각이면 같은 칸·같은 단계를 보여 준다. three·DOM에 의존하지 않는다.
 */
export class ReelDirector {
  private reel: string[] = []
  private reelKey = ''
  private plan: RevealPlan | null = null
  private planKey = ''
  readonly frame: ReelFrame = { mode: 'idle', position: 0, base: 0, speed: 0, spinMs: 0, place: null, result: undefined,
    target: null, sinceLanding: -1, highlight: 0, fly: -1, filled: false, fillFlash: 0 }

  update(input: DirectorInput): ReelFrame {
    const reelKey = input.slotKey + '|' + input.candidates.length
    if (reelKey !== this.reelKey) {
      this.reelKey = reelKey
      this.reel = buildReel(input.candidates, input.exclude, input.seed)
    }
    const f = this.frame
    Object.assign(f, { place: input.place, result: undefined, target: null, sinceLanding: -1, highlight: 0, fly: -1,
      filled: false, fillFlash: 0 })
    if (input.phase !== 'REVEALING' || input.result === undefined) { this.plan = null; this.planKey = '' }
    switch (input.phase) {
      case 'SPINNING':
      case 'PAUSED': {
        const ms = input.spinElapsedMs + (input.phase === 'SPINNING' ? input.phaseElapsedMs : 0)
        f.mode = input.phase === 'SPINNING' ? 'spin' : 'paused'
        f.spinMs = ms
        f.base = spinPosition(ms)
        f.speed = spinSpeed(ms)
        f.position = detent(f.base, f.speed)
        break
      }
      case 'REVEALING': {
        if (input.result === undefined) break
        const planKey = `${input.slotKey}|${input.spinElapsedMs}|${input.result === null}`
        if (planKey !== this.planKey) {
          this.planKey = planKey
          this.plan = planReveal(input.spinElapsedMs, input.result === null)
        }
        const plan = this.plan!, elapsed = Math.max(0, input.phaseElapsedMs)
        const motion = revealMotion(plan, elapsed)
        f.spinMs = input.spinElapsedMs + elapsed
        f.base = motion.position
        f.speed = motion.speed
        f.result = input.result
        f.target = plan.target
        if (elapsed < plan.landAfterMs) {
          f.mode = 'landing'
          f.position = detent(motion.position, motion.speed)
          break
        }
        const since = elapsed - plan.landAfterMs, place = input.place ?? 3
        f.mode = 'landed'
        f.sinceLanding = since
        f.position = plan.target + bounce(since)
        const empty = input.result === null, hold = HIGHLIGHT_MS[place], fill = fillDelay(place, empty)
        if (!empty) {
          f.highlight = Math.max(0, 1 - since / hold)
          if (since >= hold && since < hold + FLY_MS) f.fly = (since - hold) / FLY_MS
        }
        f.filled = since >= fill
        if (f.filled) f.fillFlash = Math.max(0, 1 - (since - fill) / 1000)
        break
      }
      default:
        f.mode = input.phase === 'COMPLETED' ? 'complete' : 'idle'
        f.speed = 0
    }
    return f
  }

  /** 회전 목록의 index번째 칸. 착지 칸에는 서버가 공개한 결과만 놓인다. */
  label(index: number) {
    if (this.frame.target === index && this.frame.result !== undefined) return this.frame.result ?? EMPTY_LABEL
    const n = this.reel.length
    return n ? this.reel[((index % n) + n) % n]! : PLACEHOLDER_LABEL
  }
}

/** 현재 슬롯보다 먼저 발표된 당첨자. 회전 목록에서 뺀다. */
export function revealedBefore(status: LiveStatus) {
  const limit = status.currentSlotIndex ?? status.revealed.length
  return new Set(status.revealed.filter(r => r.slotIndex < limit && r.nickname !== null).map(r => r.nickname!))
}

export function currentResult(status: LiveStatus | null): string | null | undefined {
  if (status?.phase !== 'REVEALING' || status.currentSlotIndex === null) return undefined
  return status.revealed[status.currentSlotIndex]?.nickname
}

export function currentPlace(status: LiveStatus | null): LivePlace | null {
  if (!status || status.currentSlotIndex === null) return null
  return status.slots[status.currentSlotIndex]?.place ?? null
}

export type CellState = 'pending' | 'winner' | 'empty'
export interface BoardCell {
  slotIndex: number
  place: LivePlace
  prizeName: string
  state: CellState
  nickname: string | null
  /** 지금 막 반영된 칸 */
  fresh: boolean
}

/**
 * 결과판 칸. 발표된 슬롯만 채우며, 지금 발표 중인 칸은 강조·이동 연출이 끝난 뒤(filledCurrent) 채운다.
 * 아직 발표하지 않은 칸은 서버에서 받은 값이 없으므로 항상 비어 있다.
 */
export function boardCells(status: LiveStatus | null, filledCurrent: boolean): BoardCell[] {
  if (!status) return []
  return status.slots.map(slot => {
    const reveal = status.revealed[slot.slotIndex]
    const current = status.phase === 'REVEALING' && slot.slotIndex === status.currentSlotIndex
    const base = { slotIndex: slot.slotIndex, place: slot.place, prizeName: slot.prizeName }
    if (!reveal || current && !filledCurrent) return { ...base, state: 'pending', nickname: null, fresh: false }
    return { ...base, state: reveal.nickname === null ? 'empty' : 'winner', nickname: reveal.nickname, fresh: current }
  })
}

/** 한 프레임의 연출 상태. 기계 컴포넌트가 계산하고 이름 창·현판·결과판·효과가 읽는다. */
export interface LiveScene {
  director: ReelDirector
  frame: ReelFrame
  status: LiveStatus | null
  cells: BoardCell[]
  headline: { title: string; sub: string }
  /** 꽃가루·별 효과. key가 바뀌면 새로 터지고 ageMs로 위치를 계산한다 */
  burst: { key: string; ageMs: number; kind: 'winner' | 'first' | 'complete' } | null
  /** 실제 시계(초). 대기 조명 숨쉬기에만 쓴다 */
  clock: number
}

export function headline(status: LiveStatus | null, frame: Pick<ReelFrame, 'mode' | 'result' | 'spinMs' | 'filled'>) {
  if (!status) return { title: '공개 추첨 연결 중', sub: '' }
  const slot = status.currentSlotIndex === null ? undefined : status.slots[status.currentSlotIndex]
  const place = slot ? `${slot.place}등` : ''
  const sub = slot?.prizeName ?? ''
  switch (status.phase) {
    case 'READY': return { title: '추첨 대기 중', sub: '곧 공개 추첨을 시작해요' }
    case 'SPINNING':
      return { title: frame.spinMs < SPIN.fastUntilMs ? `${place} 당첨자 추첨 중` : `${place} 당첨자는…?`, sub }
    case 'PAUSED': return { title: `${place} 추첨 잠시 멈춤`, sub }
    case 'REVEALING':
      if (frame.mode !== 'landed') return { title: `${place} 당첨자는…?`, sub }
      if (frame.result === null) return { title: `${place} 당첨자 없음`, sub: frame.filled ? '다음 추첨을 기다리는 중' : sub }
      return { title: `${place} 당첨을 축하합니다!`, sub: frame.filled ? '다음 추첨을 기다리는 중' : sub }
    default: return { title: '모든 당첨자 발표 완료', sub: '축하합니다!' }
  }
}
