import { expect, it } from 'vitest'
import { dropTarget, legalDrop, type HeldPiece } from '../../src/game/quoridor/drag'
import { cellPoint, wallPoint } from '../../src/game/quoridor/presentation'
import { remainingSeconds } from '../../src/game/quoridor/TurnTime'
import type { Quoridor } from '../../src/game/quoridor/protocol'

const board = { version: 7, status: 'PLAYING', legalMoves: [{ x: 4, y: 1 }],
  legalWalls: [{ x: 3, y: 4, orientation: 'VERTICAL' }] } as Quoridor
function held(kind: HeldPiece['kind'], p: number[]): HeldPiece { return { kind, version: 7, pointerId: 1, x: p[0], z: p[2] } }
it('말의 합법 목적지에만 놓고 판 밖이나 낡은 버전·종료 상태는 전송하지 않는다', () => {
  const piece = held('move', cellPoint({ x: 4, y: 1 }))
  expect(legalDrop(piece, board, 'HORIZONTAL')).toEqual({ kind: 'move', x: 4, y: 1 })
  expect(legalDrop({ ...piece, version: 6 }, board, 'HORIZONTAL')).toBeNull()
  expect(legalDrop(piece, { ...board, status: 'FINISHED' }, 'HORIZONTAL')).toBeNull()
  expect(legalDrop(held('move', cellPoint({ x: 5, y: 1 })), board, 'HORIZONTAL')).toBeNull()
  expect(dropTarget({ ...piece, x: 2 }, 'HORIZONTAL')).toBeNull()
})
it('장벽의 홈과 방향은 서버 합법 목록과 모두 일치해야 한다', () => {
  const piece = held('wall', wallPoint({ x: 3, y: 4, orientation: 'VERTICAL' }))
  expect(legalDrop(piece, board, 'VERTICAL')).toEqual({ kind: 'wall', x: 3, y: 4, orientation: 'VERTICAL' })
  expect(legalDrop(piece, board, 'HORIZONTAL')).toBeNull()
  expect(dropTarget({ ...piece, x: piece.x + .066 }, 'VERTICAL')).toBeNull()
})
it('마감 시각의 남은 초는 올림하며 0~30초 범위이고 재접속해도 초기화하지 않는다', () => {
  const deadline = '2026-11-21T00:00:30Z', start = Date.parse('2026-11-21T00:00:00Z')
  expect(remainingSeconds(deadline, start)).toBe(30)
  expect(remainingSeconds(deadline, start + 21100)).toBe(9)
  expect(remainingSeconds(deadline, start + 30000)).toBe(0)
  expect(remainingSeconds(deadline, start + 60000)).toBe(0)
  expect(remainingSeconds(null, start)).toBeNull()
})
