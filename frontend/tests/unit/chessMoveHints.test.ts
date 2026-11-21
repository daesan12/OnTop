import { describe, expect, it } from 'vitest'
import { chessMoveHints, chessSelectionLabel } from '../../src/game/chess/moveHints'
import { chessArrowGeometry } from '../../src/game/chess/ChessMoveHints'

const position = (pieces: Record<string, string>) => {
  const board = Array<string>(64).fill('.')
  for (const [square, piece] of Object.entries(pieces)) board[square.charCodeAt(0) - 97 + (Number(square[1]) - 1) * 8] = piece
  return board.join('')
}

describe('체스 이동 방향 안내', () => {
  it('서버 목적지만 표시하고 같은 방향은 마지막 목적지까지 연결한다', () => {
    const hints = chessMoveHints(position({ d4: 'R', d7: 'p' }), 'd4', ['d5', 'd7', 'b4'])
    expect(hints.targets.map(target => target.square)).toEqual(['d5', 'd7', 'b4'])
    expect(hints.paths.map(path => path.target.square)).toEqual(['d7', 'b4'])
    expect(hints.targets.find(target => target.square === 'd7')?.capture).toBe(true)
    expect(hints.targets.some(target => target.square === 'd6')).toBe(false)
  })
  it('나이트의 L자 꺾임에는 목적지 표시를 만들지 않는다', () => {
    const hints = chessMoveHints(position({ g1: 'N' }), 'g1', ['f3', 'h3'])
    expect(hints.targets.map(target => target.square)).toEqual(['f3', 'h3'])
    for (const path of hints.paths) {
      expect(path.kind).toBe('jump')
      expect(path.points).toHaveLength(3)
      const [from, bend, to] = path.points
      expect(Math.hypot(bend.x - from.x, bend.z - from.z)).toBe(2)
      expect(Math.hypot(to.x - bend.x, to.z - bend.z)).toBe(1)
    }
  })
  it('빈 칸의 앙파상과 점유된 잡기 칸을 함께 구분한다', () => {
    const hints = chessMoveHints(position({ e5: 'P', d5: 'p', f6: 'n' }), 'e5', ['e6', 'd6', 'f6'])
    expect(hints.targets.map(target => [target.square, target.capture])).toEqual([['e6', false], ['d6', true], ['f6', true]])
  })
  it('캐슬링은 두 칸 경로로 표시하고 승격 목적지는 하나로 합친다', () => {
    expect(chessMoveHints(position({ e1: 'K' }), 'e1', ['f1', 'g1']).paths[0].kind).toBe('castle')
    expect(chessMoveHints(position({ a7: 'P' }), 'a7', ['a8', 'a8', 'a8', 'a8']).targets).toHaveLength(1)
  })
  it('선택이 없거나 낡은 선택이 빈 칸이면 안내를 지운다', () => {
    const board = position({ e4: 'P' })
    expect(chessMoveHints(board, '', ['e5']).targets).toEqual([])
    expect(chessMoveHints(board, 'e2', ['e3', 'e4']).paths).toEqual([])
    expect(chessSelectionLabel(board, 'e4', ['e5', 'd5'], { P: '폰' })).toBe('e4 폰 · 이동 1칸 · 잡기 1칸')
  })
  it('긴 직선과 점선 화살표는 위에서 보이는 유효한 면과 색상을 가진다', () => {
    const ray = chessMoveHints(position({ a1: 'Q', h8: 'r' }), 'a1', ['h8', 'a8', 'h1'])
    const jump = chessMoveHints(position({ g1: 'N' }), 'g1', ['f3', 'h3'])
    const geometry = chessArrowGeometry([...ray.paths, ...jump.paths])
    for (const part of Object.values(geometry)) {
      const p = part.getAttribute('position')
      expect(p.count).toBeGreaterThan(0)
      expect([...p.array].every(Number.isFinite)).toBe(true)
      for (let i = 0; i < p.count; i += 3) {
        const upward = (p.getZ(i + 1) - p.getZ(i)) * (p.getX(i + 2) - p.getX(i)) - (p.getX(i + 1) - p.getX(i)) * (p.getZ(i + 2) - p.getZ(i))
        expect(upward).toBeGreaterThan(0)
      }
    }
    expect(geometry.fill.getAttribute('color').count).toBe(geometry.fill.getAttribute('position').count)
    geometry.outline.dispose(); geometry.fill.dispose()
  })
})
