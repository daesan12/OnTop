import { STONE_FLOOR_HEIGHTS, STONE_TILE_LAYOUT, isStoneCell, stoneArenaRadii, stoneArenaSize, type StoneArenaSize } from './layout'

export interface StonePlayer {
  userId: string; x: number; y: number; z: number; floor: number; alive: boolean; grounded: boolean
  aimX: number; aimZ: number; pigeonReadyAt: number; hitAt: number; eliminatedAt: number; forfeited: boolean
  slideStartedAt: number; slideUntil: number; slideReadyAt: number; slideX: number; slideZ: number
  rank?: number | null; rewardCoins?: number
}
export interface StoneTile { id: number; floor: number; q: number; r: number; breakAt: number; stepped: boolean }
export interface StonePigeon { id: number; owner: string; x: number; y: number; z: number; vx: number; vz: number; bornAt?: number }
export interface StonePigeonImpact extends StonePigeon { targetUserId: string; at: number }
export interface StoneState {
  tileLayout: typeof STONE_TILE_LAYOUT
  arenaSize: StoneArenaSize
  gameCode: 'STONE_RUMBLE'; gameId: string; status: 'PLAYING' | 'FINISHED'; serverTime: number
  startsAt: number; endedAt: number; endReason: string | null; winnerUserIds: string[]
  landsAt: number; phase: 'LOADING' | 'DROPPING' | 'COUNTDOWN' | 'RUNNING' | 'FINISHED'; readyUserIds?: string[]
  tiles: StoneTile[]; players: StonePlayer[]; pigeons: StonePigeon[]; impacts?: StonePigeonImpact[]
}
export interface StoneControl { kind: 'control'; seq: number; x: number; z: number; aimX: number; aimZ: number; jump: boolean; fire: boolean; slide: boolean }
export type StoneAction = StoneControl | { kind: 'scene_ready'; ready: boolean }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const id = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 120
const arenaTiles = new Map<StoneArenaSize, readonly StoneTile[]>()
function tilesFor(size: StoneArenaSize) {
  const cached = arenaTiles.get(size)
  if (cached) return cached
  const tiles = stoneArenaRadii(size).flatMap((radius, floor) => {
    const cells: Omit<StoneTile, 'id'>[] = []
    for (let q = -radius; q <= radius; q++) for (let r = -radius; r <= radius; r++) {
      if (isStoneCell(floor, q, r, size)) cells.push({ floor, q, r, breakAt: Number.MAX_SAFE_INTEGER, stepped: false })
    }
    return cells
  }).map((tile, id) => Object.freeze({ ...tile, id }))
  arenaTiles.set(size, tiles)
  return tiles
}

export function parseStoneState(value: unknown): StoneState {
  if (!object(value) || value.tileLayout !== STONE_TILE_LAYOUT || !Array.isArray(value.players)
    || value.players.length < 2 || value.players.length > 8 || value.arenaSize !== stoneArenaSize(value.players.length)) {
    throw new Error('돌탑 경기장 크기를 읽지 못했어요. 다시 연결해 주세요.')
  }
  const size = value.arenaSize as StoneArenaSize, baseTiles = tilesFor(size)
  if (!Array.isArray(value.tileMarks)
    || value.tileMarks.length > baseTiles.length || 'tiles' in value
    || !value.tileMarks.every(mark => Array.isArray(mark) && mark.length === 3
      && Number.isInteger(mark[0]) && mark[0] >= 0 && mark[0] < baseTiles.length
      && Number.isSafeInteger(mark[1]) && mark[1] > 0 && (mark[2] === 0 || mark[2] === 1))
    || new Set(value.tileMarks.map(mark => mark[0])).size !== value.tileMarks.length) {
    throw new Error('돌탑 발판 상태를 읽지 못했어요. 다시 연결해 주세요.')
  }
  // 이전 패킷에 의존하는 delta가 아니다. 재접속/늦은 관전도 이 한 응답으로 전부 복원한다.
  const tiles = baseTiles.map(tile => ({ ...tile }))
  for (const [id, breakAt, stepped] of value.tileMarks) tiles[id] = { ...baseTiles[id]!, breakAt, stepped: stepped === 1 }
  value = { ...value, tiles }
  if (!object(value) || value.gameCode !== 'STONE_RUMBLE' || value.tileLayout !== STONE_TILE_LAYOUT || !id(value.gameId)
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
      && Number(p.floor) >= 0 && Number(p.floor) < STONE_FLOOR_HEIGHTS.length && Number.isInteger(p.floor)
      && ['alive', 'grounded', 'forfeited'].every(k => typeof p[k] === 'boolean')
      && (p.rank === undefined || p.rank === null || Number.isInteger(p.rank) && Number(p.rank) >= 1 && Number(p.rank) <= 8)
      && (p.rewardCoins === undefined || Number.isInteger(p.rewardCoins) && Number(p.rewardCoins) >= 0 && Number(p.rewardCoins) <= 80))
    || new Set(value.players.map(p => p.userId)).size !== value.players.length
    || Array.isArray(value.readyUserIds) && value.readyUserIds.some(user => !(value.players as Record<string, unknown>[]).some(p => p.userId === user))
    || !Array.isArray(value.tiles) || value.tiles.length !== baseTiles.length
    || !value.tiles.every(t => object(t) && ['id', 'floor', 'q', 'r'].every(k => Number.isInteger(t[k]))
      && isStoneCell(Number(t.floor), Number(t.q), Number(t.r), size)
      && finite(t.breakAt) && typeof t.stepped === 'boolean')
    || new Set(value.tiles.map(t => `${t.floor}:${t.q}:${t.r}`)).size !== value.tiles.length
    || new Set(value.tiles.map(t => t.id)).size !== value.tiles.length
    || !Array.isArray(value.pigeons) || value.pigeons.length > 16
    || !value.pigeons.every(p => object(p) && id(p.owner) && ['id', 'x', 'y', 'z', 'vx', 'vz'].every(k => finite(p[k]))
      && (p.bornAt === undefined || finite(p.bornAt)))
    || value.impacts !== undefined && (!Array.isArray(value.impacts) || value.impacts.length > 16
      || !value.impacts.every(p => object(p) && id(p.owner) && id(p.targetUserId)
        && ['id', 'x', 'y', 'z', 'vx', 'vz', 'at'].every(k => finite(p[k]))
        && (p.bornAt === undefined || finite(p.bornAt))))) {
    throw new Error('돌탑 경기 상태를 읽지 못했어요. 다시 연결해 주세요.')
  }
  return value as unknown as StoneState
}
export const stoneName = (id: string) => ({ '101': '솔이', '202': '하늘', '303': '나루', '404': '보리', '505': '마루', '606': '여울', '707': '다온', '808': '윤슬' })[id] ?? '참가자'
