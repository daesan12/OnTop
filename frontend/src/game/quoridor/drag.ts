import type { Cell, Quoridor, QuoridorInput, Wall } from './protocol'
import { CELL_PITCH, sameCell, sameWall } from './presentation'

export interface HeldPiece { kind: 'move' | 'wall'; version: number; pointerId: number; x: number; z: number }
/** 판의 로컬 평면 좌표를 사용하므로 좌석 방향과 테이블 배율에 독립적이다. */
export function dropTarget(held: HeldPiece, orientation: Wall['orientation']): QuoridorInput | null {
  const offset = held.kind === 'move' ? 4 : 3.5, maximum = held.kind === 'move' ? 8 : 7
  const x = Math.round(held.x / CELL_PITCH + offset), y = Math.round(held.z / CELL_PITCH + offset)
  if (x < 0 || y < 0 || x > maximum || y > maximum
    || Math.abs(held.x / CELL_PITCH + offset - x) > .48 || Math.abs(held.z / CELL_PITCH + offset - y) > .48) return null
  return held.kind === 'move' ? { kind: 'move', x, y } : { kind: 'wall', x, y, orientation }
}
export function legalDrop(held: HeldPiece, board: Quoridor, orientation: Wall['orientation']): QuoridorInput | null {
  if (held.version !== board.version || board.status !== 'PLAYING') return null
  const target = dropTarget(held, orientation)
  if (!target) return null
  return target.kind === 'move' ? board.legalMoves.some((cell: Cell) => sameCell(cell, target)) ? target : null
    : board.legalWalls.some(wall => sameWall(wall, target)) ? target : null
}
