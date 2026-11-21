import { integer, record } from '../../network/protocol'

export const CODE_VALUES = Array.from({ length: 12 }, (_, value) => value).concat(-1)
export const tileText = (value: number | null) => value === null ? '비공개' : value === -1 ? '조커' : String(value)
export type TileColor = 'BLACK' | 'WHITE'
export interface CodeTile { id: string; color: TileColor; value: number | null; revealed: boolean }
export interface CodePlayer { userId: string; seat: number; active: boolean; forfeited: boolean; ready: boolean; tileCount: number; tiles: CodeTile[] }
export type CodeStage = 'SETUP' | 'DRAW' | 'PLACE_TILE' | 'GUESS' | 'CONTINUE' | 'REVEAL' | 'FINISHED'
export interface CodeEvent { kind: 'DRAW' | 'GUESS' | 'TIMEOUT' | 'FORFEIT'; actorUserId: string; targetUserId: string | null; tileId: string | null; value: number | null; correct: boolean | null }
export interface DavinciState {
  openingStartedAt?: string
  gameCode: 'DAVINCI_CODE'; status: 'PLAYING' | 'FINISHED'; stage: CodeStage; version: number
  turnUserId: string | null; turnDeadline: string | null; endedAt: string | null; endReason: string | null
  players: CodePlayer[]; supply: Pick<CodeTile, 'id' | 'color'>[]; winnerUserIds: string[]; lastEvent: CodeEvent | null
}
export interface DavinciHand { userId: string; tiles: CodeTile[]; pendingTile: CodeTile | null; validPositions: number[]; unplacedJokerIds: string[] }
export type DavinciInput = { kind: 'ready' | 'stop' | 'draw_random' }
  | { kind: 'draw' | 'reveal'; tileId: string }
  | { kind: 'place'; position: number }
  | { kind: 'place_joker'; tileId: string; position: number }
  | { kind: 'guess'; targetUserId: string; tileId: string; value: number }

const id = (v: unknown): v is string => typeof v === 'string' && !!v.trim() && v.length <= 120
const color = (v: unknown): v is TileColor => v === 'BLACK' || v === 'WHITE'
const value = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= -1 && v <= 11
const date = (v: unknown): v is string => typeof v === 'string' && /Z$/.test(v) && Number.isFinite(Date.parse(v))
const invalid = (): never => { throw new Error('흑백수사 상태를 확인해주세요.') }

function tile(v: unknown, secret = false): CodeTile {
  if (!record(v) || !id(v.id) || !color(v.color) || typeof v.revealed !== 'boolean'
    || (secret || v.revealed ? !value(v.value) : v.value !== null)) return invalid()
  return { id: v.id, color: v.color, value: v.value as number | null, revealed: v.revealed }
}

export function parseDavinci(v: unknown): DavinciState {
  if (record(v) && v.openingStartedAt !== undefined && !date(v.openingStartedAt)) return invalid()
  if (!record(v) || v.gameCode !== 'DAVINCI_CODE' || !['PLAYING', 'FINISHED'].includes(String(v.status))
    || !['SETUP', 'DRAW', 'PLACE_TILE', 'GUESS', 'CONTINUE', 'REVEAL', 'FINISHED'].includes(String(v.stage))
    || !integer(v.version) || !Array.isArray(v.players) || v.players.length < 2 || v.players.length > 4
    || !Array.isArray(v.supply) || v.supply.length > 26 || !Array.isArray(v.winnerUserIds)
    || !v.winnerUserIds.every(id) || !(v.endReason === null || id(v.endReason))) return invalid()
  const players = v.players.map((p, seat): CodePlayer => {
    if (!record(p) || !id(p.userId) || p.seat !== seat || !integer(p.tileCount) || p.tileCount < 1 || p.tileCount > 26
      || !['active', 'forfeited', 'ready'].every(key => typeof p[key] === 'boolean') || !Array.isArray(p.tiles)
      || (v.stage === 'SETUP' ? p.tiles.length !== 0 : p.tiles.length !== p.tileCount)) return invalid()
    return { userId: p.userId, seat, active: p.active as boolean, forfeited: p.forfeited as boolean, ready: p.ready as boolean,
      tileCount: p.tileCount, tiles: p.tiles.map(t => tile(t)) }
  })
  const ids = players.map(p => p.userId)
  if (new Set(ids).size !== ids.length || !v.winnerUserIds.every(w => ids.includes(w))
    || (v.status === 'FINISHED' ? v.stage !== 'FINISHED' || v.turnUserId !== null || !date(v.endedAt)
      || v.turnDeadline !== null || v.winnerUserIds.length !== 1
      : v.stage === 'FINISHED' || v.endedAt !== null || !date(v.turnDeadline) || v.winnerUserIds.length !== 0
        || (v.stage === 'SETUP' ? v.turnUserId !== null : !id(v.turnUserId) || !ids.includes(v.turnUserId)))) return invalid()
  const supply = v.supply.map(t => {
    if (!record(t) || !id(t.id) || !color(t.color) || 'value' in t) return invalid()
    return { id: t.id, color: t.color }
  })
  const allIds = [...supply.map(t => t.id), ...players.flatMap(p => p.tiles.map(t => t.id))]
  if (new Set(allIds).size !== allIds.length) return invalid()
  let lastEvent: CodeEvent | null = null
  if (v.lastEvent !== null) {
    const e = v.lastEvent
    if (!record(e) || !['DRAW', 'GUESS', 'TIMEOUT', 'FORFEIT'].includes(String(e.kind)) || !id(e.actorUserId)
      || !ids.includes(e.actorUserId) || !(e.targetUserId === null || id(e.targetUserId) && ids.includes(e.targetUserId))
      || !(e.tileId === null || id(e.tileId)) || !(e.value === null || value(e.value))
      || !(e.correct === null || typeof e.correct === 'boolean')) return invalid()
    lastEvent = e as unknown as CodeEvent
  }
  return { ...(v.openingStartedAt ? { openingStartedAt: v.openingStartedAt as string } : {}), gameCode: 'DAVINCI_CODE', status: v.status as DavinciState['status'], stage: v.stage as CodeStage, version: v.version,
    turnUserId: v.turnUserId as string | null, turnDeadline: v.turnDeadline as string | null,
    endedAt: v.endedAt as string | null, endReason: v.endReason as string | null,
    players, supply, winnerUserIds: v.winnerUserIds as string[], lastEvent }
}

export function parseDavinciHand(v: unknown, state: DavinciState, ownId: string, role: 'PLAYER' | 'SPECTATOR'): DavinciHand | null {
  if (role === 'SPECTATOR') {
    if (!record(v) || Object.keys(v).length !== 0) return invalid()
    return null
  }
  if (!record(v) || v.userId !== ownId || !Array.isArray(v.tiles) || !Array.isArray(v.validPositions)
    || !v.validPositions.every(p => integer(p) && p <= 26) || !Array.isArray(v.unplacedJokerIds)
    || !v.unplacedJokerIds.every(id)) return invalid()
  const tiles = v.tiles.map(t => tile(t, true)), me = state.players.find(p => p.userId === ownId)
  const pendingTile = v.pendingTile === null ? null : tile(v.pendingTile, true)
  if (!me || me.tileCount !== tiles.length || new Set(tiles.map(t => t.id)).size !== tiles.length
    || !v.unplacedJokerIds.every(key => tiles.some(t => t.id === key && t.value === -1))
    || (state.stage !== 'SETUP' && me.tiles.some((t, i) => t.id !== tiles[i]?.id || t.color !== tiles[i]?.color
      || t.revealed !== tiles[i]?.revealed || t.revealed && t.value !== tiles[i]?.value))
    || (pendingTile !== null && (state.turnUserId !== ownId || state.stage !== 'PLACE_TILE'
      || tiles.some(t => t.id === pendingTile.id)))) return invalid()
  return { userId: ownId, tiles, pendingTile, validPositions: v.validPositions as number[], unplacedJokerIds: v.unplacedJokerIds as string[] }
}
