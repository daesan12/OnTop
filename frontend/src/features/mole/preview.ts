import { DURATION_MS, KEYS, PHASE_MS, POINTS_PER_COIN, type Hit, type Mole, type MoleKind, type MoleRound, type MoleRules,
  type MoleSettlement, type MoleState } from './protocol'
import { scoreHits } from './scoring'
import type { MolePort } from './service'

export const PREVIEW_RULES: MoleRules = { durationMs: DURATION_MS, phaseMs: PHASE_MS, keys: [...KEYS], pointsPerCoin: POINTS_PER_COIN,
  normalPoints: 10, goldPoints: 30, decoyPenalty: 20, rapidPoints: [0, 0, 20, 30, 45, 60], comboSteps: [10, 20, 30],
  comboTenths: [10, 12, 15, 20] }
const PHASES = [[656, 2, 1100, 6, 8, 4, 3], [472, 2, 950, 8, 10, 7, 4], [360, 3, 800, 9, 12, 9, 5]] as const

/** 화면 확인용 출현표. 서버 MoleRules.schedule과 같은 규칙이지만 난수는 다르다. 실제 판에는 쓰지 않는다. */
export function previewSchedule(seed = Date.now()) {
  let s = seed >>> 0
  const random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
  const busy = KEYS.map(() => -1e9), moles: Mole[] = []
  let at = 700
  while (at < DURATION_MS) {
    const [gap, maxActive, stay, gold, rapid, decoy, rapidMax] = PHASES[Math.min(2, Math.floor(at / PHASE_MS))]!
    const active = moles.filter(m => m.leaveAt > at)
    if (active.length >= maxActive) { at = Math.min(...active.map(m => m.leaveAt)) + 40; continue }
    const free = KEYS.map((_, hole) => hole).filter(hole => busy[hole]! + 150 <= at)
    if (!free.length) { at += 60; continue }
    const hole = free[Math.floor(random() * free.length)]!, roll = Math.floor(random() * 100)
    const kind: MoleKind = roll < gold ? 'GOLD' : roll < gold + rapid ? 'RAPID' : roll < gold + rapid + decoy ? 'DECOY' : 'NORMAL'
    const hits = kind === 'RAPID' ? 2 + Math.floor(random() * (rapidMax - 1)) : 1
    const life = kind === 'GOLD' ? Math.floor(stay * 55 / 100) : kind === 'RAPID' ? hits * 220 + 600 : stay
    if (at + life > DURATION_MS) break
    moles.push({ id: moles.length, hole, kind, hits, appearAt: at, leaveAt: at + life })
    busy[hole] = at + life
    at += Math.round(gap * (0.7 + random() * 0.6))
  }
  return moles
}

/** DEV에서 명시적으로 켠 화면 확인용 대역. 실제 엽전·서버와 연결되지 않으며 서버 실패 시 대체로 쓰지 않는다. */
export class PreviewMoleService implements MolePort {
  private earned = 0
  private best = 0
  private next = 0
  private round: MoleRound | null = null
  private last: MoleSettlement['result'] | null = null

  async status(): Promise<MoleState> {
    return { serverNow: new Date().toISOString(), todayEarned: this.earned, dailyCap: 500, bestScore: this.best,
      rules: PREVIEW_RULES, last: this.last }
  }

  async start() {
    this.round = { id: String(++this.next), startedAt: new Date().toISOString(), rules: PREVIEW_RULES, moles: previewSchedule() }
    return this.round
  }

  async complete(roundId: string, hits: readonly Hit[]): Promise<MoleSettlement> {
    if (!this.round || this.round.id !== roundId) throw new Error('round')
    const score = scoreHits(this.round.moles, PREVIEW_RULES, hits)
    const reward = Math.max(0, Math.min(score.coins, 500 - this.earned))
    this.earned += reward
    this.best = Math.max(this.best, score.score)
    this.last = { id: roundId, score: score.score, maxCombo: score.maxCombo, caught: score.caught,
      calculatedReward: score.coins, reward, settledAt: new Date().toISOString() }
    return { result: this.last, todayEarned: this.earned, dailyCap: 500, bestScore: this.best }
  }
}
