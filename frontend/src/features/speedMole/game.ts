/** Separate, local-only play model. No wallet, server score or legacy mole rules are used. */
export const SPEED_MOLE_KEYS = ['R', 'T', 'Y', 'U', 'F', 'G', 'H', 'J'] as const
export const SPEED_MOLE_CODES = SPEED_MOLE_KEYS.map(key => `Key${key}`)
export const SPEED_MOLE_DURATION_MS = 60_000
export const SPEED_MOLE_COUNTDOWN_MS = 3_000
export const SPEED_MOLE_ACTIVE = 4
export const SPEED_MOLE_POP_MS = 100
export interface SpeedTarget { id: number; hole: number; appearedAt: number }
export type SpeedStrike = { kind: 'hit' | 'miss'; hole: number; score: number } | { kind: 'ignored' }

export class SpeedMoleRound {
  score = 0
  hits = 0
  misses = 0
  readonly targets: SpeedTarget[] = []
  private nextId = 0
  private lastAt: number

  constructor(readonly startedAt: number, private readonly random: () => number = Math.random) {
    this.lastAt = startedAt
    const available = SPEED_MOLE_KEYS.map((_, hole) => hole)
    for (let n = 0; n < SPEED_MOLE_ACTIVE; n++) {
      const hole = available.splice(this.pick(available.length), 1)[0]!
      this.targets.push({ id: ++this.nextId, hole, appearedAt: startedAt })
    }
  }
  private pick(length: number) { return Math.min(length - 1, Math.max(0, Math.floor(this.random() * length))) }
  remaining(at: number) { return Math.max(0, Math.min(SPEED_MOLE_DURATION_MS, SPEED_MOLE_DURATION_MS - (at - this.startedAt))) }
  phaseAt(at: number): 'countdown' | 'playing' | 'result' {
    return at < this.startedAt ? 'countdown' : this.remaining(at) > 0 ? 'playing' : 'result'
  }
  countdown(at: number) { return Math.max(0, Math.min(3, Math.ceil((this.startedAt - at) / 1000))) }
  strike(hole: number, at: number): SpeedStrike {
    if (!Number.isInteger(hole) || hole < 0 || hole >= SPEED_MOLE_KEYS.length || !Number.isFinite(at)
      || at < this.lastAt || this.remaining(at) <= 0) return { kind: 'ignored' }
    this.lastAt = at
    const index = this.targets.findIndex(target => target.hole === hole)
    if (index < 0) { this.misses++; this.score = Math.max(0, this.score - 3); return { kind: 'miss', hole, score: this.score } }
    // Pick from the four previously empty holes, excluding the one just hit.
    const empty = SPEED_MOLE_KEYS.map((_, h) => h).filter(h => !this.targets.some(target => target.hole === h))
    this.targets[index] = { id: ++this.nextId, hole: empty[this.pick(empty.length)]!, appearedAt: at }
    this.hits++; this.score++
    return { kind: 'hit', hole, score: this.score }
  }
}

/** Native repeat distinguishes a held key from a fresh press even if a keyup was lost. */
export function speedMoleHole(code: string, repeat = false) {
  const hole = SPEED_MOLE_CODES.indexOf(code)
  return hole < 0 || repeat ? null : hole
}
