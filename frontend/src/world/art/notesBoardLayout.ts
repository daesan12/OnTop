import type { AnonymousNote } from '../../config/notes'
import { compareNotes } from '../../features/notes/validation'

import { NOTES_BOARD_SCALE } from '../../config/notes'
export { NOTES_BOARD_SCALE } from '../../config/notes'
export const NOTES_BOARD_LOD_DISTANCE = 16 * NOTES_BOARD_SCALE
export const NOTES_BOARD_VISIBLE_LIMIT = 6
export const MEMO_ATLAS_GRID = 3
export const MEMO_ATLAS_ROWS = 2

/** Physical slots, with no example text or pretend posts. */
export const memoSlots = [
  { x: -.31, y: 1.10, w: .27, h: .235, a: -.055 },
  { x: 0, y: 1.10, w: .27, h: .245, a: .045 },
  { x: .31, y: 1.10, w: .27, h: .235, a: -.035 },
  { x: -.31, y: .81, w: .27, h: .235, a: .045 },
  { x: 0, y: .81, w: .27, h: .235, a: -.045 },
  { x: .31, y: .81, w: .27, h: .245, a: .04 },
] as const

export function visibleBoardNotes(notes: readonly AnonymousNote[]) {
  return [...notes].sort(compareNotes).slice(0, NOTES_BOARD_VISIBLE_LIMIT)
}
