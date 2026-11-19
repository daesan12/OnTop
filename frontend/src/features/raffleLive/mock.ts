import type { LiveCandidate, LivePhase, LivePlace, LiveSlot, LiveSnapshot } from './protocol'
import { EMPTY_HOLD_MS, FLY_MS, HIGHLIGHT_MS, seededRandom, SPIN } from './reel'

/**
 * 프리뷰 전용 Mock 서버. 실제 결과 결정과 진행 제어는 S3 서버가 맡는다.
 * 확정 결과는 비공개 필드(#results)에만 두고, 발표 요청을 받은 슬롯만 revealed로 내보낸다.
 */
export const MOCK_PRIZES: Readonly<Record<LivePlace, string>> = { 1: '1등 경품', 2: '2등 경품', 3: '3등 경품' }
export type MockOrder = 'lowFirst' | 'highFirst'
export const MOCK_ORDERS: readonly { id: MockOrder; label: string }[] = [
  { id: 'lowFirst', label: '3등 → 2등 → 1등' }, { id: 'highFirst', label: '1등 → 2등 → 3등' }]
/** 발표 순서는 서버가 정한 slots 배열 순서를 따른다. */
export function mockSlots(order: MockOrder): LiveSlot[] {
  const places: LivePlace[] = order === 'lowFirst' ? [3, 3, 3, 3, 3, 2, 2, 1] : [1, 2, 2, 3, 3, 3, 3, 3]
  return places.map((place, slotIndex) => ({ slotIndex, place, prizeName: MOCK_PRIZES[place] }))
}

const NAMES = ['온탑고수', '탑골러버', '비둘기맛쿠키', '장기고수', '오목의신', '붕어빵장인', '파클마스터', '차요차요왕',
  '공원산책러', '엽전부자', '팔각정단골', '종로토박이', '윷놀이명인', '단풍구경꾼', '탑골지기', '바둑돌줍기',
  '한량할매', '꽃신신고', '솔바람', '고무신사냥꾼', '공기놀이왕', '제기차기달인', '호떡한입', '은행잎수집가',
  '해질녘벤치', '동전던지기', '민속놀이왕', '탑골공원비둘기', '삼일문지기', '장독대', '모과차한잔', '뻥튀기아저씨',
  '골목대장', '정자나무', '토끼띠언니', '청춘다방', '보름달', '꽃담', '쌍화차', '두꺼비집',
  '아주아주긴닉네임을가진사람', 'OnTopLover', 'player_77', '산들바람', '종이학', '구름빵', '느티나무', '송편빚기']

export interface MockScenario { id: 'crowd' | 'few'; label: string; candidates: LiveCandidate[] }
export const MOCK_SCENARIOS: readonly MockScenario[] = [
  { id: 'crowd', label: `응모자 ${NAMES.length}명`,
    candidates: NAMES.map((nickname, i) => ({ nickname, tickets: 1 + (i * 37 + 11) % 50 })) },
  { id: 'few', label: '응모자 3명 (빈 슬롯 확인)',
    candidates: [{ nickname: '온탑고수', tickets: 12 }, { nickname: '탑골러버', tickets: 3 }, { nickname: '비둘기맛쿠키', tickets: 1 }] },
]

/** 응모권 1장당 1표, 당첨된 사람은 이후 등수에서 제외. 1등부터 뽑아 응모자가 모자라면 낮은 등수가 빈다. */
function drawResults(candidates: readonly LiveCandidate[], slots: readonly LiveSlot[], seed: number) {
  const random = seededRandom(seed)
  const pool = candidates.map(c => ({ ...c }))
  const results: (string | null)[] = slots.map(() => null)
  const order = [...slots].sort((a, b) => a.place - b.place || a.slotIndex - b.slotIndex)
  for (const slot of order) {
    const total = pool.reduce((sum, c) => sum + c.tickets, 0)
    if (!total) break
    let pick = random() * total
    const at = pool.findIndex(c => (pick -= c.tickets) < 0)
    results[slot.slotIndex] = pool[at]!.nickname
    pool.splice(at, 1)
  }
  return results
}

export class MockLiveServer {
  readonly #slots: readonly LiveSlot[]
  readonly #results: readonly (string | null)[]
  #phase: LivePhase = 'READY'
  #version = 1
  #current: number | null = null
  #revealed = 0
  #spinElapsed = 0
  #phaseStartedAt: number

  constructor(readonly scenario: MockScenario, readonly liveEventId = 1, private readonly clock: () => number = Date.now,
    order: MockOrder = 'lowFirst') {
    this.#slots = mockSlots(order)
    // 등수별 당첨자는 발표 순서와 무관하게 같다. 같은 행사 번호면 같은 결과.
    const byPlace = drawResults(scenario.candidates, mockSlots('highFirst'), liveEventId * 7919)
    const queue = new Map<LivePlace, (string | null)[]>([[1, byPlace.slice(0, 1)], [2, byPlace.slice(1, 3)], [3, byPlace.slice(3)]])
    this.#results = this.#slots.map(slot => queue.get(slot.place)!.shift() ?? null)
    this.#phaseStartedAt = clock()
  }

  get phase() { return this.#phase }
  /** 현재 단계 경과(ms). 프리뷰 자동 진행용 */
  elapsed() { return this.clock() - this.#phaseStartedAt }

  /**
   * 자동 진행에서 서버가 다음 신호를 보낼 시점(현재 단계 경과 ms). 프리뷰 기본 연출값이다.
   * 빈 슬롯은 오래 돌리지 않고 곧바로 공개한다.
   */
  autoDelay(): number | null {
    const slot = this.#current === null ? undefined : this.#slots[this.#current]
    const empty = this.#current !== null && this.#results[this.#current] === null
    switch (this.#phase) {
      case 'READY': return 1000
      case 'SPINNING': return empty ? 1200 : Math.max(0, SPIN.decelUntilMs - this.#spinElapsed)
      case 'REVEALING': return empty ? 900 + EMPTY_HOLD_MS + 600 : 1100 + HIGHLIGHT_MS[slot!.place] + FLY_MS + 1800
      default: return null
    }
  }

  /** REST 현재 상태 조회는 withCandidates=true, WS 방송은 false */
  snapshot(withCandidates: boolean): LiveSnapshot {
    const snapshot: LiveSnapshot = {
      liveEventId: this.liveEventId, version: this.#version, phase: this.#phase,
      serverTime: new Date(this.clock()).toISOString(), phaseStartedAt: new Date(this.#phaseStartedAt).toISOString(),
      slots: this.#slots.map(s => ({ ...s })), currentSlotIndex: this.#current, spinElapsedMs: this.#spinElapsed,
      revealed: this.#results.slice(0, this.#revealed).map((nickname, slotIndex) => ({ slotIndex, nickname })),
    }
    if (withCandidates) snapshot.candidates = this.scenario.candidates.map(c => ({ ...c }))
    return snapshot
  }

  start() {
    if (this.#phase !== 'READY') return null
    this.#spinElapsed = 0
    return this.#slots.length ? this.#move('SPINNING', 0) : this.#move('COMPLETED', null)
  }
  /** 회전 중에만 멈출 수 있다. 멈춘 시점까지의 회전 시간을 보존한다. */
  pause() {
    if (this.#phase !== 'SPINNING') return null
    this.#spinElapsed += this.elapsed()
    return this.#move('PAUSED', this.#current)
  }
  resume() { return this.#phase === 'PAUSED' ? this.#move('SPINNING', this.#current) : null }
  /** 현재 슬롯의 결과를 공개한다. 이 순간부터 해당 슬롯 결과만 상태에 포함된다. */
  reveal() {
    if (this.#phase !== 'SPINNING') return null
    this.#spinElapsed += this.elapsed()
    this.#revealed++
    return this.#move('REVEALING', this.#revealed - 1)
  }
  next() {
    if (this.#phase !== 'REVEALING') return null
    this.#spinElapsed = 0
    return this.#revealed >= this.#slots.length ? this.#move('COMPLETED', null) : this.#move('SPINNING', this.#revealed)
  }
  /** 프리뷰 전용 전체 초기화 */
  reset() {
    this.#revealed = 0
    this.#spinElapsed = 0
    return this.#move('READY', null)
  }

  #move(phase: LivePhase, current: number | null) {
    this.#phase = phase
    this.#current = current
    this.#version++
    this.#phaseStartedAt = this.clock()
    return this.snapshot(false)
  }
}
