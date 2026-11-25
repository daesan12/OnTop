import type { StoneState } from './protocol'

export const STONE_HIT_EFFECT_MS = 240
const MAX_EVENT_AGE = 250
const PIGEON_COOLDOWN = 1500
export interface StoneCue { kind: 'fire' | 'hit' | 'step' | 'crack' | 'jump' | 'cloud' | 'eliminated' | 'ring-warning' | 'collapse' | 'slide'; userId: string; at: number; x: number; y: number; z: number; owner?: string }
export interface StoneFeedbackFrame { enabled: boolean; hits: Map<string, { hitAt: number; startedAt: number }>; confirmedAt?: number }

/** 입력 예측 대신 서버의 발사 예약/피격 시각을 읽는다. 복구·중복·지난 사건은 재생하지 않는다. */
export class StoneFeedbackTracker {
  private gameId = ''
  private time = -1
  private enabled = false
  private players = new Map<string, { shot: number; hit: number }>()

  reset() { this.gameId = ''; this.time = -1; this.enabled = false; this.players.clear() }

  read(state: StoneState, enabled: boolean): StoneCue[] {
    if (state.gameId === this.gameId && enabled && this.enabled && state.serverTime <= this.time) return []
    const continuous = enabled && this.enabled && state.gameId === this.gameId
      && state.serverTime > this.time && state.serverTime - this.time <= 1000
    const cues: StoneCue[] = []
    if (continuous && state.phase === 'RUNNING') for (const player of state.players) {
      const before = this.players.get(player.userId)
      if (!before) continue
      const fresh = (at: number) => at > 0 && state.serverTime >= at && state.serverTime - at <= MAX_EVENT_AGE
      const shotAt = player.pigeonReadyAt - PIGEON_COOLDOWN
      if (player.pigeonReadyAt > before.shot && shotAt >= state.startsAt && fresh(shotAt))
        cues.push({ kind: 'fire', userId: player.userId, at: shotAt, x: player.x, y: player.y + .8, z: player.z })
      if (player.hitAt > before.hit && fresh(player.hitAt)) {
        const impact = state.impacts?.find(p => p.targetUserId === player.userId && Math.abs(p.at - player.hitAt) <= 20)
        cues.push({ kind: 'hit', userId: player.userId, at: impact?.at ?? player.hitAt,
          x: impact?.x ?? player.x, y: impact?.y ?? player.y + .8, z: impact?.z ?? player.z, owner: impact?.owner })
      }
    }
    this.gameId = state.gameId; this.time = state.serverTime; this.enabled = enabled
    this.players = new Map(state.players.map(player => [player.userId, { shot: player.pigeonReadyAt, hit: player.hitAt }]))
    return cues
  }
}

export interface StoneListener { userId: string; x: number; y: number; z: number }
export const globalStoneCue = (cue: StoneCue) => cue.kind === 'cloud' || cue.kind === 'ring-warning'
export const stoneCueDistance = (cue: StoneCue, listener: StoneListener) => globalStoneCue(cue) ? 0 : Math.hypot(cue.x - listener.x, cue.y - listener.y, cue.z - listener.z)
/** 동시 사건은 관전/본인 대상부터, 가까운 소리 최대4개만 들려준다. 시각 효과는 별도로 전부 표시한다. */
export function audibleStoneCues(cues: StoneCue[], listener: StoneListener) {
  const priority = (cue: StoneCue) => (cue.userId === listener.userId ? -100 : globalStoneCue(cue) ? -50 : 0)
    + stoneCueDistance(cue, listener) + (cue.kind === 'hit' ? -.5 : 0)
  return cues.filter(cue => stoneCueDistance(cue, listener) < 18).sort((a, b) => priority(a) - priority(b)).slice(0, 4)
}
