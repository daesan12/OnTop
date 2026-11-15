export interface StonePlayer {
  userId: string; x: number; y: number; z: number; floor: number; alive: boolean; grounded: boolean
  aimX: number; aimZ: number; pigeonReadyAt: number; hitAt: number; eliminatedAt: number; forfeited: boolean
  slideStartedAt: number; slideUntil: number; slideReadyAt: number; slideX: number; slideZ: number
  rank?: number | null; rewardCoins?: number
}
export interface StoneTile { id: number; floor: number; q: number; r: number; breakAt: number; stepped: boolean }
export interface StonePigeon { id: number; owner: string; x: number; y: number; z: number; vx: number; vz: number }
export interface StoneState {
  gameCode: 'STONE_RUMBLE'; gameId: string; status: 'PLAYING' | 'FINISHED'; serverTime: number
  startsAt: number; endedAt: number; endReason: string | null; winnerUserIds: string[]
  landsAt: number; phase: 'LOADING' | 'DROPPING' | 'COUNTDOWN' | 'RUNNING' | 'FINISHED'; readyUserIds?: string[]
  tiles: StoneTile[]; players: StonePlayer[]; pigeons: StonePigeon[]
}
export interface StoneControl { kind: 'control'; seq: number; x: number; z: number; aimX: number; aimZ: number; jump: boolean; fire: boolean; slide: boolean }
export type StoneAction = StoneControl | { kind: 'scene_ready'; ready: boolean }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const id = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 120
export function parseStoneState(value: unknown): StoneState {
  if (!object(value) || value.gameCode !== 'STONE_RUMBLE' || !id(value.gameId)
    || !['PLAYING', 'FINISHED'].includes(String(value.status))
    || !['serverTime', 'startsAt', 'endedAt', 'landsAt'].every(k => finite(value[k]))
    || !['LOADING', 'DROPPING', 'COUNTDOWN', 'RUNNING', 'FINISHED'].includes(String(value.phase))
    || value.readyUserIds !== undefined && (!Array.isArray(value.readyUserIds) || !value.readyUserIds.every(id)
      || new Set(value.readyUserIds).size !== value.readyUserIds.length)
    || !(value.endReason === null || typeof value.endReason === 'string')
    || !Array.isArray(value.winnerUserIds) || !value.winnerUserIds.every(id)
    || !Array.isArray(value.players) || value.players.length < 2 || value.players.length > 8
    || !value.players.every(p => object(p) && id(p.userId)
      && ['x', 'y', 'z', 'aimX', 'aimZ', 'pigeonReadyAt', 'hitAt', 'eliminatedAt', 'slideStartedAt', 'slideUntil', 'slideReadyAt', 'slideX', 'slideZ'].every(k => finite(p[k]))
      && [0, 1, 2].includes(Number(p.floor)) && Number.isInteger(p.floor)
      && ['alive', 'grounded', 'forfeited'].every(k => typeof p[k] === 'boolean')
      && (p.rank === undefined || p.rank === null || Number.isInteger(p.rank) && Number(p.rank) >= 1 && Number(p.rank) <= 8)
      && (p.rewardCoins === undefined || Number.isInteger(p.rewardCoins) && Number(p.rewardCoins) >= 0 && Number(p.rewardCoins) <= 80))
    || new Set(value.players.map(p => p.userId)).size !== value.players.length
    || Array.isArray(value.readyUserIds) && value.readyUserIds.some(user => !(value.players as Record<string, unknown>[]).some(p => p.userId === user))
    || !Array.isArray(value.tiles) || value.tiles.length !== 683
    || !value.tiles.every(t => object(t) && ['id', 'floor', 'q', 'r'].every(k => Number.isInteger(t[k]))
      && [0, 1, 2].includes(Number(t.floor)) && finite(t.breakAt) && typeof t.stepped === 'boolean')
    || !Array.isArray(value.pigeons) || value.pigeons.length > 16
    || !value.pigeons.every(p => object(p) && id(p.owner) && ['id', 'x', 'y', 'z', 'vx', 'vz'].every(k => finite(p[k])))) {
    throw new Error('돌탑 경기 상태를 읽지 못했어요. 다시 연결해 주세요.')
  }
  return value as unknown as StoneState
}
export const stoneName = (id: string) => ({ '101': '솔이', '202': '하늘', '303': '나루', '404': '보리', '505': '마루', '606': '여울', '707': '다온', '808': '윤슬' })[id] ?? '참가자'
