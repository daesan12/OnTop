import { describe, expect, it } from 'vitest'
import { chessCapturePose, chessMotion, chessTravelPose, type ChessPosition } from '../../src/game/chess/motion'

const position = (pieces: Record<string, string>, moves: string[] = [], gameId = 'g'): ChessPosition => {
  const board = Array<string>(64).fill('.')
  for (const [square, piece] of Object.entries(pieces)) board[square.charCodeAt(0) - 97 + (Number(square[1]) - 1) * 8] = piece
  return { board: board.join(''), moves, gameId }
}

describe('서버 확정 체스 수의 표시 애니메이션', () => {
  it('두 공개 보드와 기보가 일치하는 한 수만 연결한다', () => {
    const from = position({ e2: 'P' }), to = position({ e4: 'P' }, ['e2e4'])
    const motion = chessMotion(from, to)!
    expect(motion.travel).toEqual([{ from: 12, to: 28, piece: 'P', result: 'P', jump: false }])
    expect(motion.captured).toBeNull()
    expect(chessMotion(from, position({ e4: 'P', a1: 'R' }, ['e2e4']))).toBeNull()
  })
  it('최초 연결·새 경기·복구로 건너뛴 수·변경된 기보는 재생하지 않는다', () => {
    const from = position({ e2: 'P' }), to = position({ e4: 'P' }, ['e2e4'])
    expect(chessMotion(null, to)).toBeNull()
    expect(chessMotion(from, { ...to, gameId: 'new' })).toBeNull()
    expect(chessMotion(from, { ...to, moves: ['e2e3', 'e3e4'] })).toBeNull()
    expect(chessMotion({ ...from, moves: ['g1f3'] }, { ...to, moves: ['b1c3', 'e2e4'] })).toBeNull()
    expect(chessMotion(to, { ...to })).toBeNull()
  })
  it('상대 기물의 이전 위치를 잡기 연출로 남기고 내 기물이나 킹은 잡지 않는다', () => {
    const from = position({ e4: 'P', d5: 'p' }), to = position({ d5: 'P' }, ['e4d5'])
    expect(chessMotion(from, to)?.captured).toEqual({ index: 35, piece: 'p' })
    for (const piece of ['P', 'k']) expect(chessMotion(position({ e4: 'P', d5: piece }), to)).toBeNull()
  })
  it('나이트는 바닥 이동과 구분되는 호를 그리며 정확한 칸에 착지한다', () => {
    const motion = chessMotion(position({ g1: 'N' }), position({ f3: 'N' }, ['g1f3']))!
    const travel = motion.travel[0]
    expect(chessTravelPose(travel, 0)).toMatchObject({ x: 1, z: 2, y: 0 })
    expect(chessTravelPose(travel, .5).y).toBeCloseTo(.85)
    expect(chessTravelPose(travel, 1).x).toBe(0)
    expect(chessTravelPose(travel, 1).y).toBeCloseTo(0)
    expect(chessTravelPose(travel, 1).z).toBe(0)
  })
  it('백 킹사이드·흑 퀸사이드 캐슬링은 킹과 룩을 함께 이동한다', () => {
    const white = chessMotion(position({ e1: 'K', h1: 'R' }), position({ g1: 'K', f1: 'R' }, ['e1g1']))!
    expect(white.travel.map(p => [p.from, p.to])).toEqual([[4, 6], [7, 5]])
    const black = chessMotion(position({ e8: 'k', a8: 'r' }), position({ c8: 'k', d8: 'r' }, ['e8c8']))!
    expect(black.travel.map(p => [p.from, p.to])).toEqual([[60, 58], [56, 59]])
  })
  it('양쪽 앙파상은 목적지 옆의 잡힌 폰을 제거한다', () => {
    expect(chessMotion(position({ e5: 'P', d5: 'p' }), position({ d6: 'P' }, ['e5d6']))?.captured).toEqual({ index: 35, piece: 'p' })
    expect(chessMotion(position({ d4: 'p', e4: 'P' }), position({ e3: 'p' }, ['d4e3']))?.captured).toEqual({ index: 28, piece: 'P' })
  })
  it('승격은 이동 중 폰을 유지하고 착지 후 서버의 새 기물로 바꾼다', () => {
    expect(chessMotion(position({ a7: 'P' }), position({ a8: 'Q' }, ['a7a8q']))?.travel[0]).toMatchObject({ piece: 'P', result: 'Q' })
    expect(chessMotion(position({ b2: 'p', a1: 'R' }), position({ a1: 'n' }, ['b2a1n']))?.captured?.piece).toBe('R')
  })
  it('늦은 프레임은 위치·투명도·크기를 범위 밖으로 넘기지 않는다', () => {
    const travel = chessMotion(position({ a1: 'R' }), position({ a8: 'R' }, ['a1a8']))!.travel[0]
    for (const t of [-1, 0, .5, 1, 10]) {
      expect(Object.values(chessTravelPose(travel, t)).every(Number.isFinite)).toBe(true)
      const capture = chessCapturePose(t)
      expect(capture.opacity).toBeGreaterThanOrEqual(0); expect(capture.opacity).toBeLessThanOrEqual(1)
      expect(capture.scale).toBeGreaterThan(0)
    }
    expect(chessCapturePose(10).opacity).toBe(0)
    expect(chessTravelPose(travel, 10).x).toBe(0)
    expect(chessTravelPose(travel, 10).z).toBe(0)
  })
})
