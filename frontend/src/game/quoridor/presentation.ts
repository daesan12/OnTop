import type { Cell, Quoridor, Wall } from './protocol'

export const PLAYER_COLORS = ['#d7a444', '#ab4436', '#4b7549', '#437da0'] as const
export const GOAL_LABELS = { NORTH: '북쪽 끝줄', EAST: '동쪽 끝줄', SOUTH: '남쪽 끝줄', WEST: '서쪽 끝줄' }
export const BOARD_Y = 1.13
export const BOARD_SPAN = 1.4
export const CELL_PITCH = .132
export const TILE_SIZE = .118
export const coordinate = (cell: Cell) => `${String.fromCharCode(65 + cell.x)}${9 - cell.y}`
export const sameCell = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y
export const sameWall = (a: Wall, b: Wall) => sameCell(a, b) && a.orientation === b.orientation
export const cellPoint = (cell: Cell): [number, number, number] => [(cell.x - 4) * CELL_PITCH, .034, (cell.y - 4) * CELL_PITCH]
export const wallPoint = (wall: Wall): [number, number, number] => [(wall.x - 3.5) * CELL_PITCH, .079, (wall.y - 3.5) * CELL_PITCH]
export const wallDimensions = (wall: Wall): [number, number, number] => wall.orientation === 'HORIZONTAL'
  ? [CELL_PITCH * 2 - .012, .09, .018] : [.018, .09, CELL_PITCH * 2 - .012]
export const playerGoal = (board: Quoridor, ownId: string) => board.players.find(player => player.userId === ownId)?.goal
