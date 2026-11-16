import type { Envelope } from '../../../network/protocol'
import type { HallView } from '../serviceHall/previewModel'
import type { ChefView } from '../chef/model'

export interface CoopTransport {
  protectVR?(): Promise<() => void>
  scope(): { userId: string; channelId: string | null; connected: boolean }
  request(type: string, payload: Record<string, unknown>, expected: readonly string[], onId?: (id: string) => void): Promise<Envelope>
  subscribe(listener: (message: Envelope) => boolean): () => void
  requestJSON(path: string, init?: RequestInit): Promise<unknown>
}
export interface CoopPublic {
  roomName?: string; hostNickname?: string; locked?: boolean
  gameCode: 'SKEWER_COOP'; phase: 'WAITING' | 'COUNTDOWN' | 'PLAYING' | 'FINISHED'; channelId: string
  remaining: number; elapsed: number; countdown: number; score: number; served: number; paused: boolean
  actionVersion: number
  pauseReason?: '' | 'DISCONNECTED' | 'EXIT_CONFIRM' | 'RESTART_CONFIRM'
  pausedBy?: string[]
  round?: number
  restart?: { id: string; requestedBy: string; expiresAt: number } | null
  rankingEligible: boolean; rankingMode?: 'PC' | 'VR'; chefVR: boolean; entryFee: 0; rewardStatus: 'SERVER_SETTLEMENT' | 'NOT_CONNECTED'; message: string; endReason: string | null
  players: { userId: string; role: '' | 'chef' | 'server'; ready: boolean; connected: boolean }[]
  greeting: { active: boolean; index: number; remaining: number; answered: boolean; responded: number; speech: boolean; outcome?: '' | 'success' | 'missed'; bonus?: number }
}
export interface CoopRoom {
  gameId: string; players: number; mine: boolean; roomName: string; hostNickname: string; locked: boolean
}
export interface CoopSnapshot {
  gameId: string; version: number; registered: boolean; publicState: CoopPublic
  privateState: { role: '' | 'chef' | 'server'; hall?: Omit<HallView, 'elapsed' | 'remaining' | 'message' | 'score' | 'served' | 'revision' | 'finished' | 'storageOpen'>; chef?: Pick<ChefView, 'visible' | 'waiting' | 'selectedJob' | 'skewer' | 'pass' | 'pantry' | 'completed' | 'hallSight'> }
}
export interface CoopResult {
  gameId: string; status: 'SETTLED' | 'PENDING' | 'UNAVAILABLE'; teamScore: number; served: number; endReason: string
  rankingStatus: 'REGISTERED' | 'EXCLUDED' | 'PENDING'; rankingReason: string; coinsCalculated: number
  coinsGranted: number | null; todayEarned: number | null; dailyCap: number; remainingToday: number | null
  balance: number | null; rewardDate: string | null; settledAt: string | null
}
export interface CoopRankingItem {
  rank: number; gameId: string; chefUserId: string; chefNickname: string; serverUserId: string; serverNickname: string
  teamScore: number; served: number; endedAt: string; playMode?: 'PC' | 'VR'
}
export interface CoopRanking { rulesVersion: string; period: string; aggregation: string; asOf: string; items: CoopRankingItem[]; myBest: CoopRankingItem | null; playMode?: 'PC' | 'VR' | 'ALL' }
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const nonnegative = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0
export function parseCoopResult(value: unknown, gameId: string): CoopResult {
  if (!object(value) || value.gameId !== gameId || !['SETTLED', 'PENDING', 'UNAVAILABLE'].includes(String(value.status))
    || ![value.teamScore, value.served, value.coinsCalculated].every(nonnegative) || value.dailyCap !== 1000
    || value.coinsCalculated !== Math.floor((value.teamScore as number) / 20)
    || !['REGISTERED', 'EXCLUDED', 'PENDING'].includes(String(value.rankingStatus))
    || typeof value.rankingReason !== 'string' || typeof value.endReason !== 'string') throw new Error('경기 결과를 확인해주세요.')
  if (value.status === 'SETTLED' && (![value.coinsGranted, value.todayEarned, value.remainingToday, value.balance].every(nonnegative)
    || (value.coinsGranted as number) > Math.min(1000, value.coinsCalculated as number)
    || value.remainingToday !== Math.max(0, 1000 - (value.todayEarned as number))
    || typeof value.rewardDate !== 'string' || typeof value.settledAt !== 'string')) throw new Error('정산 영수증을 확인해주세요.')
  if (value.status !== 'SETTLED' && [value.coinsGranted, value.todayEarned, value.remainingToday, value.balance, value.rewardDate, value.settledAt].some(v => v !== null)) throw new Error('미확정 보상을 지급 내역으로 표시할 수 없어요.')
  return value as unknown as CoopResult
}
export function parseCoopRanking(value: unknown): CoopRanking {
  const item = (v: unknown) => object(v) && nonnegative(v.rank) && (v.rank as number) > 0 && nonnegative(v.teamScore) && nonnegative(v.served)
    && (v.playMode === undefined || ['PC', 'VR'].includes(String(v.playMode)))
    && ['gameId', 'chefUserId', 'chefNickname', 'serverUserId', 'serverNickname', 'endedAt'].every(key => typeof v[key] === 'string')
  if (!object(value) || value.rulesVersion !== 'coop-v1' || value.period !== 'ALL_TIME' || value.aggregation !== 'TEAM_BEST'
    || value.playMode !== undefined && !['PC', 'VR', 'ALL'].includes(String(value.playMode))
    || typeof value.asOf !== 'string'
    || !Array.isArray(value.items) || value.items.length > 20 || !value.items.every(item)
    || value.myBest !== null && !item(value.myBest)) throw new Error('팀 랭킹 응답을 확인해주세요.')
  return { ...value, playMode: value.playMode ?? 'VR' } as unknown as CoopRanking
}
export function parseCoop(value: unknown): CoopSnapshot | null {
  if (!object(value) || typeof value.gameId !== 'string' || !/^skewer-coop-[a-f0-9-]{36}$/.test(value.gameId)
    || !Number.isSafeInteger(value.version) || (value.version as number) < 0 || !object(value.publicState) || !object(value.privateState)) return null
  const p = value.publicState, secret = value.privateState
  if (p.rankingMode !== undefined && !['PC', 'VR'].includes(String(p.rankingMode))) return null
  if (p.round !== undefined && !nonnegative(p.round)) return null
  if (object(p.greeting) && (p.greeting.outcome !== undefined && !['', 'success', 'missed'].includes(String(p.greeting.outcome))
    || p.greeting.bonus !== undefined && (!nonnegative(p.greeting.bonus) || (p.greeting.bonus as number) > 50))) return null
  const restart = p.restart
  if (restart != null && (!object(restart) || typeof restart.id !== 'string'
    || !/^\d+$/.test(restart.id) || typeof restart.requestedBy !== 'string'
    || !Array.isArray(p.players) || !p.players.some(player => object(player) && player.userId === restart.requestedBy)
    || !nonnegative(restart.expiresAt) || p.paused !== true || p.pauseReason !== 'RESTART_CONFIRM')) return null
  if (p.gameCode !== 'SKEWER_COOP' || !['WAITING', 'COUNTDOWN', 'PLAYING', 'FINISHED'].includes(String(p.phase))
    || typeof p.channelId !== 'string' || !Array.isArray(p.players) || p.players.length < 1 || p.players.length > 2
    || p.players.some(player => !object(player) || typeof player.userId !== 'string' || !['', 'chef', 'server'].includes(String(player.role)))
    || !['', 'chef', 'server'].includes(String(secret.role)) || !object(p.greeting)
    || !Number.isSafeInteger(p.actionVersion) || (p.actionVersion as number) < 0
    || ![p.remaining, p.elapsed, p.score, p.countdown].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0)) return null
  if (secret.role === 'server' && (!object(secret.hall) || !Array.isArray(secret.hall.tables) || secret.hall.tables.length !== 6 || !object(secret.hall.position))) return null
  if (secret.role === 'chef' && (!object(secret.chef) || !Array.isArray(secret.chef.visible) || secret.chef.visible.length > 2 || !Array.isArray(secret.chef.skewer))) return null
  return { ...value, registered: value.registered !== false } as unknown as CoopSnapshot
}

// 공통 소켓을 공유하되 꼬치왕 상태를 다른 게임의 상태 저장소로 흘려보내지 않는다.
const listeners = new Set<(message: Envelope) => boolean>()
export const subscribeCoop = (listener: (message: Envelope) => boolean) => { listeners.add(listener); return () => { listeners.delete(listener) } }
export function routeCoopMessage(message: Envelope) {
  let accepted = false
  for (const listener of listeners) accepted = listener(message) || accepted
  return accepted || message.type === 'GAME_STATE' && object(message.payload.publicState) && message.payload.publicState.gameCode === 'SKEWER_COOP'
    || message.type === 'GAME_CONNECTION_STATE' && String(message.payload.gameId ?? '').startsWith('skewer-coop-')
}
