export interface Piece {
  id: string; owner: number; type: string; x: number; y: number; vx: number; vy: number
  radius: number; mass: number; alive: boolean; launchSpeed?: number; modifier?: string | null; powerUp?: boolean; restorePending?: boolean
  exit?: { x: number; y: number; vx: number; vy: number; at: number } | null
}
export interface SocialView {
  chat: { id: string; label: string; actor: number; text: string; at: number }[]
  cursors: { id: string; label: string; actor: number; x: number; y: number; expiresAt: number }[]
  advice: { id: string; label: string; turnNumber: number; pieceId: string; dx: number; dy: number; power: number; expiresAt: number }[]
}
export type Wall = { owner: number; x: number; y: number; length: number; thickness: number; angle: number; expiresAfterTurn: number | null }
export const snapshotWalls = (s: Snapshot | null) => s?.walls ?? (s?.wall ? [s.wall] : [])
export interface Snapshot {
  gameId: string; version: number; tick: number; simulationId: number; serverNow: number
  stage: 'WAITING' | 'AIMING' | 'SIMULATING' | 'CHOOSING' | 'FINISHED'; turn: number; turnNumber: number
  turnDeadline: number; matchDeadline: number; winner: number | null; endReason: string | null
  pieces: Piece[]; timeouts: number[]; provisional: boolean
  settings: { halfWidth: number; halfHeight: number; maximumImpulse: number; deceleration: number; restitution: number }
  modelId?: string; inputCurveBoost?: number
  social?: SocialView; connections?: { red: boolean; green: boolean; viewers: number }
  cardChoices?: { actor: number; deadline: number }[]; pausedTurnMillis?: number | null
  reconnectDeadlines?: (number | null)[]; endedAt?: number | null
  impacts?: { id: number; at: number; x: number; y: number; impulse: number; kind: string }[]
  cardRules?: { weights: number[]; allowDuplicates: boolean; excludeExhaustedWalls: boolean }
  walls?: Wall[]
  wall?: Wall | null
  wallsUsed?: number[]; boostedPieceId?: string | null
  itemRules?: { wallLength: number; wallThickness: number; wallMargin: number; relocateDistance: number; powerMultiplier: number;
    growScale: number; shrinkScale: number; defendMassMultiplier: number; effectOpponentTurns: number }
  itemUsedThisTurn?: boolean; extraShotsRemaining?: number
  lastItemEffect?: { version: number; turnNumber: number; actor: number; type: string; targets: string[] } | null
}
type Frame = { seq: number; at: number; state: Snapshot }

/** 서버 결과만 재생한다. 지연 시 외삽으로 새 충돌·탈락을 만들어내지 않는다. */
export class AlkkagiReplay {
  private readonly delayMs: number
  constructor(delayMs = 100) {
    if (!Number.isFinite(delayMs) || delayMs < 0 || delayMs > 500) throw new Error('INVALID_REPLAY_DELAY')
    this.delayMs = delayMs
  }
  private frames: Frame[] = []
  private epoch = 0
  get generation() { return this.epoch }
  clear() { this.frames = []; this.epoch++ }
  push(seq: number, state: Snapshot, at: number) {
    if (!Number.isSafeInteger(seq) || !state || !Array.isArray(state.pieces)
      || state.pieces.length !== 32 || state.pieces.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return
    const last = this.frames.at(-1)
    if (last && seq <= last.seq) return
    if (last && last.state.gameId !== state.gameId) this.frames = []
    this.frames.push({ seq, state, at })
    if (this.frames.length > 12) this.frames.shift()
  }
  sample(now: number): Snapshot | null {
    if (!this.frames.length) return null
    const target = now - this.delayMs
    let a = this.frames[0], b = a
    for (const frame of this.frames) {
      if (frame.at <= target) a = frame
      if (frame.at >= target) { b = frame; break }
      b = frame
    }
    const t = a === b ? 1 : Math.max(0, Math.min(1, (target - a.at) / (b.at - a.at)))
    // 턴/권한 UI는 별도 최신 상태를 쓰고, 화면만 100ms 버퍼로 재생한다.
    return { ...a.state, pieces: a.state.pieces.map((p, i) => {
      const next = b.state.pieces[i]
      return { ...(t >= 1 ? next : p), x: p.x + (next.x - p.x) * t, y: p.y + (next.y - p.y) * t,
        alive: t >= 1 ? next.alive : p.alive }
    }) }
  }
}
