import { record } from '../../network/protocol'

export const COLORS = ['BLACK', 'BLUE', 'RED', 'YELLOW'] as const
export type Color = typeof COLORS[number]
export const COLOR_LABEL: Record<Color, string> = { BLACK: '검정', BLUE: '파랑', RED: '빨강', YELLOW: '노랑' }
export interface Tile { id: string; color: Color | null; number: number }
export interface Placed { id: string; color: Color; number: number }
export interface Rummikub {
  gameCode: 'RUMMIKUB'; status: 'PLAYING' | 'FINISHED'; turnTimeLimitMs: number
  turnUserId: string | null; turnId: number; turnDeadline: string | null
  poolCount: number; initialMeldPoints: number; jokerPenalty: number; melds: Placed[][]
  players: { userId: string; tileCount: number; registered: boolean; forfeited: boolean; score: number | null }[]
  winnerUserIds: string[]; endReason: string | null; endedAt: string | null; lastEvent: string
}
export interface RummikubHand { userId: string; tiles: Tile[] }
export type RummikubInput = { kind: 'draw' } | { kind: 'play'; melds: Placed[][] }
const number = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max
const id = (v: unknown): v is string => typeof v === 'string' && /^[1-9]\d{0,18}$/.test(v)
const date = (v: unknown): v is string => typeof v === 'string' && /Z$/.test(v) && Number.isFinite(Date.parse(v))
export const isColor = (v: unknown): v is Color => COLORS.includes(v as Color)
export function physical(id: string): Tile | null {
  if (/^JOKER-[01]$/.test(id)) return { id, color: null, number: 0 }
  const match = /^(BLACK|BLUE|RED|YELLOW)-(\d{1,2})-([01])$/.exec(id)
  return match && number(Number(match[2]), 1, 13) && String(Number(match[2])) === match[2]
    ? { id, color: match[1] as Color, number: Number(match[2]) } : null
}
export function validMeld(meld: Placed[]): boolean {
  if (meld.length < 3 || meld.length > 13 || new Set(meld.map(t => t.id)).size !== meld.length
    || meld.some(t => !isColor(t.color) || !number(t.number, 1, 13))) return false
  return (meld.length <= 4 && new Set(meld.map(t => t.number)).size === 1 && new Set(meld.map(t => t.color)).size === meld.length)
    || meld.every((t, i) => t.color === meld[0]!.color && (!i || t.number === meld[i - 1]!.number + 1))
}
const invalid = (): never => { throw new Error('루미큐브 상태 형식을 확인해주세요.') }
export function parseRummikub(p: unknown): Rummikub {
  if (!record(p) || p.gameCode !== 'RUMMIKUB' || !['PLAYING', 'FINISHED'].includes(String(p.status))
    || p.turnTimeLimitMs !== 120000 || p.initialMeldPoints !== 30 || p.jokerPenalty !== 30
    || !number(p.turnId, 1, Number.MAX_SAFE_INTEGER) || !number(p.poolCount, 0, 78)
    || !Array.isArray(p.players) || p.players.length < 2 || p.players.length > 4
    || !p.players.every(v => record(v) && id(v.userId) && number(v.tileCount, 0, 106)
      && typeof v.registered === 'boolean' && typeof v.forfeited === 'boolean'
      && (v.score === null || number(v.score, -788, 788)))
    || !Array.isArray(p.melds) || p.melds.length > 35 || !Array.isArray(p.winnerUserIds)
    || !['START', 'DRAW', 'PLAY', 'TURN_TIMEOUT', 'PLAYER_LEFT'].includes(String(p.lastEvent))) return invalid()
  const players = p.players as Rummikub['players'], ids = players.map(v => v.userId)
  if (new Set(ids).size !== ids.length || !p.winnerUserIds.every(v => id(v) && ids.includes(v))
    || new Set(p.winnerUserIds).size !== p.winnerUserIds.length) return invalid()
  const seen = new Set<string>()
  const melds = p.melds.map(m => {
    if (!Array.isArray(m) || m.some(t => !record(t) || typeof t.id !== 'string' || !isColor(t.color) || !number(t.number, 1, 13))) return invalid()
    const meld = m as Placed[]
    if (!validMeld(meld)) return invalid()
    for (const t of meld) {
      const tile = physical(t.id)
      if (!tile || seen.has(t.id) || tile.color !== null && (tile.color !== t.color || tile.number !== t.number)) return invalid()
      seen.add(t.id)
    }
    return meld
  })
  if (seen.size + players.reduce((sum, v) => sum + v.tileCount, 0) + p.poolCount !== 106) return invalid()
  if (p.status === 'PLAYING' ? !id(p.turnUserId) || !players.some(v => v.userId === p.turnUserId && !v.forfeited)
    || !date(p.turnDeadline) || p.endedAt !== null || p.endReason !== null || p.winnerUserIds.length !== 0 || players.some(v => v.score !== null)
    : p.turnUserId !== null || p.turnDeadline !== null || !date(p.endedAt)
      || !['EMPTY_HAND', 'STALEMATE', 'LAST_PLAYER_STANDING'].includes(String(p.endReason)) || p.winnerUserIds.length === 0
      || players.some(v => v.score === null)) return invalid()
  return { ...(p as unknown as Rummikub), players, melds }
}
export function parseRummikubHand(p: unknown, state: Rummikub, own: string, role: 'PLAYER' | 'SPECTATOR'): RummikubHand | null {
  if (role === 'SPECTATOR') {
    if (!record(p) || Object.keys(p).length) return invalid()
    return null
  }
  if (!record(p) || p.userId !== own || !Array.isArray(p.tiles)
    || p.tiles.length !== state.players.find(v => v.userId === own)?.tileCount) return invalid()
  const publicIds = new Set(state.melds.flat().map(t => t.id)), seen = new Set<string>()
  const tiles = p.tiles.map(t => {
    if (!record(t) || typeof t.id !== 'string') return invalid()
    const tile = physical(t.id)
    if (!tile || tile.color !== t.color || tile.number !== t.number || seen.has(tile.id) || publicIds.has(tile.id)) return invalid()
    seen.add(tile.id)
    return tile
  })
  return { userId: own, tiles }
}
