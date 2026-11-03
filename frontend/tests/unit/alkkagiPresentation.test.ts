import { describe, expect, it } from 'vitest'
import { exitFlight } from '../../src/game/alkkagi/flight'
import { itemPreview } from '../../src/game/alkkagi/placement'
import type { Piece, Snapshot } from '../../src/game/alkkagi/replay'
import { remainingMatchTime, UsedCardTimeline } from '../../src/game/alkkagi/presentation'

it('전체 시간은 서버 마감 기준이며 만료 뒤 음수가 되지 않는다', () => {
  expect(remainingMatchTime(722500, 2500)).toBe('12:00')
  expect(remainingMatchTime(722500, 721501)).toBe('0:01')
  expect(remainingMatchTime(722500, 800000)).toBe('0:00')
})

it('사용 카드 공개는 첫 조회·중복·재접속을 재생하지 않고 합쳐진 새 사건은 순서대로 받는다', () => {
  const timeline = new UsedCardTimeline()
  const effect = (version: number, at = 1000) => ({ version, turnNumber: 1, actor: 0, type: 'WALL', targets: [], at })
  expect(timeline.accept('g', [effect(1)], 1000)).toEqual([])
  expect(timeline.accept('g', [effect(1), effect(2), effect(3)], 1100).map(e => e.version)).toEqual([2, 3])
  expect(timeline.accept('g', [effect(3)], 1200)).toEqual([])
  expect(timeline.accept('g', [effect(4, 1000)], 6000)).toEqual([])
  expect(timeline.accept('g', [effect(5, 9000)], 6000)).toEqual([])
  expect(new UsedCardTimeline().accept('g', [effect(3)], 1200)).toEqual([])
})

describe('장외 연출과 중심 기준 변형', () => {
  const piece: Piece = { id: 'p', owner: 1, type: '卒', x: 4.51, y: 0, vx: 0, vy: 0,
    radius: .24, mass: .8, alive: false, exit: { x: 4.51, y: 0, vx: 12, vy: -3, at: 100 } }
  it('정지 스냅샷이어도 장외 속도·방향을 이어가고 유한 시간 뒤 사라진다', () => {
    const a = exitFlight(piece, .2), b = exitFlight(piece, .4)
    expect(a.x).toBeGreaterThan(piece.x); expect(a.z).toBeLessThan(0)
    expect((a.x - piece.x) / a.z).toBeCloseTo(-4)
    expect(b.x).toBeGreaterThan(a.x); expect(b.height).toBeLessThan(a.height)
    expect(b.opacity).toBeLessThan(a.opacity); expect(exitFlight(piece, 1).visible).toBe(false)
    expect(piece.x).toBe(4.51)
  })
  it('힘이 큰 장외는 더 멀리 진행한다', () => {
    const slow = { ...piece, exit: { ...piece.exit!, vx: 2 } }
    expect(exitFlight(piece, .2).x).toBeGreaterThan(exitFlight(slow, .2).x)
  })
  it('같은 시간 간격의 수평 이동량과 회전량은 줄고 이동 거리는 유한하다', () => {
    const a = exitFlight(piece, .1), b = exitFlight(piece, .2), c = exitFlight(piece, .3)
    expect(c.x - b.x).toBeLessThan(b.x - a.x)
    expect(c.spin - b.spin).toBeLessThan(b.spin - a.spin)
    expect(exitFlight(piece, .9).x - piece.exit!.x).toBeLessThan(piece.exit!.vx / 6)
    expect(exitFlight(piece, 0).x).toBe(piece.exit!.x)
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

it('힘 강화는 이미 강화된 내 알의 중복 사용만 막고 다른 대상은 허용한다', () => {
 const s={turn:0,settings:{halfWidth:4.5,halfHeight:5},pieces:[{id:'p',owner:0,alive:true,x:0,y:0,radius:.24,powerUp:true}]} as Snapshot
 expect(itemPreview(s,'POWER_UP',['p'],null).valid).toBe(false)
 s.pieces[0].powerUp=false
 expect(itemPreview(s,'POWER_UP',['p'],null).valid).toBe(true)
})
