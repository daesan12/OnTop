import { integer, record } from '../../network/protocol'

export interface Cell { x: number; y: number }
export type Orientation = 'HORIZONTAL' | 'VERTICAL'
export interface Wall extends Cell { orientation: Orientation }
export interface Quoridor {
  gameCode: 'QUORIDOR'; boardSize: 9; version: number; status: 'PLAYING' | 'FINISHED'
  players: { userId: string; x: number; y: number; goal: 'NORTH' | 'EAST' | 'SOUTH' | 'WEST'; wallsRemaining: number; active: boolean }[]
  walls: Wall[]; legalMoves: Cell[]; legalWalls: Wall[]; turnUserId: string | null; turnDeadline: null
  winnerUserIds: string[]; endReason: 'GOAL_REACHED' | 'LAST_PLAYER_STANDING' | null; endedAt: string | null
}
export type QuoridorInput = ({ kind: 'move' } & Cell) | ({ kind: 'wall' } & Wall)
const cell = (value: unknown, maximum: number): value is Cell => record(value)
  && integer(value.x) && integer(value.y) && value.x >= 0 && value.x <= maximum && value.y >= 0 && value.y <= maximum
const wall = (value: unknown): value is Wall => cell(value, 7) && record(value)
  && ['HORIZONTAL', 'VERTICAL'].includes(String(value.orientation))
export function parseQuoridor(value: unknown): Quoridor {
  if (!record(value) || value.gameCode !== 'QUORIDOR' || value.boardSize !== 9 || !integer(value.version)
    || !['PLAYING', 'FINISHED'].includes(String(value.status)) || value.turnDeadline !== null
    || !Array.isArray(value.players) || ![2, 4].includes(value.players.length)
    || !value.players.every(p => record(p) && typeof p.userId === 'string' && /^[1-9]\d{0,18}$/.test(p.userId)
      && cell(p, 8) && ['NORTH', 'EAST', 'SOUTH', 'WEST'].includes(String(p.goal))
      && integer(p.wallsRemaining) && p.wallsRemaining >= 0 && p.wallsRemaining <= ((value.players as unknown[]).length === 2 ? 10 : 5)
      && typeof p.active === 'boolean')
    || !Array.isArray(value.walls) || value.walls.length > 20 || !value.walls.every(wall)
    || !Array.isArray(value.legalMoves) || value.legalMoves.length > 12 || !value.legalMoves.every(c => cell(c, 8))
    || !Array.isArray(value.legalWalls) || value.legalWalls.length > 128 || !value.legalWalls.every(wall)
    || !Array.isArray(value.winnerUserIds) || value.winnerUserIds.length > 1
    || new Set(value.players.map(p => p.userId)).size !== value.players.length
    || new Set(value.players.filter(p => p.active).map(p => `${p.x}:${p.y}`)).size !== value.players.filter(p => p.active).length
    || value.players.reduce((sum, p) => sum + Number(p.wallsRemaining), value.walls.length) !== 20
    || (value.status === 'PLAYING'
      ? value.endReason !== null || value.endedAt !== null || value.winnerUserIds.length !== 0
        || !value.players.some(p => p.active && p.userId === value.turnUserId)
      : value.turnUserId !== null || !['GOAL_REACHED', 'LAST_PLAYER_STANDING'].includes(String(value.endReason))
        || typeof value.endedAt !== 'string' || !Number.isFinite(Date.parse(value.endedAt))
        || value.winnerUserIds.length !== 1 || !value.players.some(p => p.active && p.userId === (value.winnerUserIds as unknown[])[0])))
    throw new Error('쿼리도 판·참가자·차례 상태를 확인해주세요.')
  return value as unknown as Quoridor
}
