import { describe, expect, it } from 'vitest'
import { exitFlight } from '../../src/game/alkkagi/flight'
import { itemPreview } from '../../src/game/alkkagi/placement'
import type { Piece, Snapshot } from '../../src/game/alkkagi/replay'

describe('장외 연출과 중심 기준 변형', () => {
  const piece: Piece = { id: 'p', owner: 1, type: '卒', x: 4.51, y: 0, vx: 0, vy: 0,
    radius: .24, mass: .8, alive: false, exit: { x: 4.51, y: 0, vx: 12, vy: -3, at: 100 } }
  it('정지 스냅샷이어도 장외 속도·방향을 이어가고 유한 시간 뒤 사라진다', () => {
    const a = exitFlight(piece, .2), b = exitFlight(piece, .4)
    expect(a.x).toBeCloseTo(6.91); expect(a.z).toBeCloseTo(-.6)
    expect(b.x).toBeGreaterThan(a.x); expect(b.height).toBeLessThan(a.height)
    expect(b.opacity).toBeLessThan(a.opacity); expect(exitFlight(piece, 1).visible).toBe(false)
    expect(piece.x).toBe(4.51)
  })
  it('힘이 큰 장외는 더 멀리 진행한다', () => {
    const slow = { ...piece, exit: { ...piece.exit!, vx: 2 } }
    expect(exitFlight(piece, .2).x).toBeGreaterThan(exitFlight(slow, .2).x)
  })
  it('모서리 상대알의 크기 변경·재배치는 허용하고 중첩·중심 밖은 거절한다', () => {
    const s = { turn: 0, settings: { halfWidth: 4.5, halfHeight: 5 }, pieces: [{ ...piece, alive: true, x: 4.49, y: 4.99 }] } as Snapshot
    for (const type of ['GROW', 'SHRINK']) expect(itemPreview(s, type, ['p'], null).valid).toBe(true)
    expect(itemPreview(s, 'RELOCATE', ['p'], { x: 4.49, y: 4.99, angle: 0 }).valid).toBe(true)
    expect(itemPreview(s, 'RELOCATE', ['p'], { x: 4.51, y: 4.99, angle: 0 }).valid).toBe(false)
    s.pieces.push({ ...piece, id: 'other', alive: true, x: 4.1, y: 4.99 })
    expect(itemPreview(s, 'GROW', ['p'], null).valid).toBe(false)
  })
})
