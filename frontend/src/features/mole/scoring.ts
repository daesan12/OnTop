import { KEYS, type Hit, type Mole, type MoleRules } from './protocol'

/** 서버 MoleRules.score와 같은 판정(규칙 버전 3). 바꿀 때는 backend MoleRulesTests와 tests/unit/mole.test.ts의 같은 기록을 함께 고친다. */
export const REACTION_FLOOR_MS = 60
export const SAME_HOLE_MIN_MS = 60
export const AFTERSHOCK_MS = 250
/** 아무것도 없는 구멍을 치면 이 시간 동안 모든 키를 받지 않는다. */
export const STUN_MS = 2000
/** 기절을 봐주는 아슬아슬한 경우: 곧 나올 두더지(앞)와 막 들어간 두더지(뒤). */
export const EARLY_GRACE_MS = 150
export const LATE_GRACE_MS = 250

export type HitEvent =
  | { type: 'ignored'; reason: 'range' | 'stunned' | 'repeat' | 'early' | 'aftershock' }
  | { type: 'empty'; stunned: boolean }
  | { type: 'decoy'; mole: Mole }
  | { type: 'tap'; mole: Mole; left: number }
  | { type: 'catch'; mole: Mole; points: number; tenths: number }

export const comboTenths = (rules: MoleRules, combo: number) =>
  rules.comboTenths[rules.comboSteps.filter(step => combo >= step).length]!

/** 시간 순서로 들어오는 타격을 하나씩 판정한다. 화면은 이 결과로 효과와 점수를 그린다. */
export class MoleScorer {
  score = 0
  combo = 0
  maxCombo = 0
  caught = 0
  /** 이 시각(판 시작 기준 ms)까지 기절해 있다. */
  stunUntil = -Infinity
  private readonly lastHit = KEYS.map(() => -Infinity)
  private readonly caughtAt = KEYS.map(() => -Infinity)
  private readonly taps = new Map<number, number>()
  private readonly done = new Set<number>()

  constructor(private readonly moles: readonly Mole[], private readonly rules: MoleRules) {}

  /** 지금 구멍에 나와 있는(아직 잡히지 않은) 두더지. */
  visible(hole: number, at: number) {
    return this.moles.find(m => m.hole === hole && !this.done.has(m.id) && m.appearAt <= at && at < m.leaveAt)
  }

  isDone(id: number) { return this.done.has(id) }
  tapsOf(id: number) { return this.taps.get(id) ?? 0 }

  hit(hole: number, at: number): HitEvent {
    if (hole < 0 || hole >= KEYS.length || at < 0 || at > this.rules.durationMs) return { type: 'ignored', reason: 'range' }
    if (at < this.stunUntil) return { type: 'ignored', reason: 'stunned' }
    if (at - this.lastHit[hole]! < SAME_HOLE_MIN_MS) return { type: 'ignored', reason: 'repeat' }
    this.lastHit[hole] = at
    const mole = this.visible(hole, at)
    if (mole && at - mole.appearAt < REACTION_FLOOR_MS) return { type: 'ignored', reason: 'early' }
    if (!mole) {
      if (at - this.caughtAt[hole]! < AFTERSHOCK_MS) return { type: 'ignored', reason: 'aftershock' }
      if (this.moles.some(m => m.hole === hole && m.appearAt > at && m.appearAt - at <= EARLY_GRACE_MS)) {
        return { type: 'ignored', reason: 'early' }
      }
      this.combo = 0
      // 막 들어간 두더지를 늦게 친 것은 콤보만 끊고, 아무것도 없던 구멍은 기절한다.
      const late = this.moles.some(m => m.hole === hole && m.leaveAt <= at && at - m.leaveAt <= LATE_GRACE_MS)
      if (!late) this.stunUntil = at + STUN_MS
      return { type: 'empty', stunned: !late }
    }
    if (mole.kind === 'DECOY') {
      this.done.add(mole.id); this.caughtAt[hole] = at; this.score -= this.rules.decoyPenalty; this.combo = 0
      return { type: 'decoy', mole }
    }
    if (mole.kind === 'RAPID') {
      const taps = this.tapsOf(mole.id) + 1
      this.taps.set(mole.id, taps)
      if (taps < mole.hits) return { type: 'tap', mole, left: mole.hits - taps }
    }
    const base = mole.kind === 'GOLD' ? this.rules.goldPoints : mole.kind === 'RAPID' ? this.rules.rapidPoints[mole.hits]! : this.rules.normalPoints
    this.done.add(mole.id); this.caughtAt[hole] = at
    this.combo++; this.maxCombo = Math.max(this.maxCombo, this.combo); this.caught++
    const tenths = comboTenths(this.rules, this.combo), points = Math.floor(base * tenths / 10)
    this.score += points
    return { type: 'catch', mole, points, tenths }
  }

  /** 서버와 같은 최종값. 점수는 0 아래로 내려가지 않는다. */
  total() { return Math.max(0, this.score) }
  coins() { return Math.floor(this.total() / this.rules.pointsPerCoin) }
}

export function scoreHits(moles: readonly Mole[], rules: MoleRules, hits: readonly Hit[]) {
  const scorer = new MoleScorer(moles, rules)
  for (const hit of [...hits].filter(h => h.at >= 0 && h.at <= rules.durationMs).sort((a, b) => a.at - b.at)) scorer.hit(hit.hole, hit.at)
  return { score: scorer.total(), maxCombo: scorer.maxCombo, caught: scorer.caught, coins: scorer.coins() }
}
