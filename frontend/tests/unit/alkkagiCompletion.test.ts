import { describe, expect, it } from 'vitest'
import { AlkkagiFeedback } from '../../src/game/alkkagi/feedback'
import { AlkkagiInbox } from '../../src/game/alkkagi/inbox'
import { itemPreview, overlapsWall, wallsOverlap } from '../../src/game/alkkagi/placement'
import type { Snapshot } from '../../src/game/alkkagi/replay'

function state(): Snapshot {
  return { gameId: 'test-game', version: 1, tick: 0, simulationId: 0, stage: 'AIMING', turn: 0, turnNumber: 1,
    turnDeadline: 30000, matchDeadline: 720000, serverNow: 100, winner: null, endReason: null,
    timeouts: [0, 0], provisional: true, settings: { halfWidth: 4.5, halfHeight: 5, maximumImpulse: 30, deceleration: 60, restitution: 1 },
    pieces: Array.from({ length: 32 }, (_, i) => ({ id: `p${i}`, owner: i < 16 ? 0 : 1, type: i === 0 ? '漢' : '兵',
      x: i === 1 ? -2 : 0, y: i === 16 ? -2 : 2, vx: 0, vy: 0, radius: i === 0 ? .43 : .24, mass: i === 0 ? 6.4 : .8,
      alive: [0, 1, 16].includes(i) })) }
}

describe('알까기 확정 전 미리보기', () => {
  it('벽의 회전 형상·알·가장자리와 기존 벽·한도를 구분한다', () => {
    const s = state()
    expect(itemPreview(s, 'WALL', [], { x: 0, y: 0, angle: Math.PI / 4 }).valid).toBe(true)
    expect(itemPreview(s, 'WALL', [], { x: 0, y: 2, angle: 0 }).valid).toBe(false)
    expect(itemPreview(s, 'WALL', [], { x: 4, y: 0, angle: 0 }).valid).toBe(false)
    expect(itemPreview({ ...s, wallsUsed: [3, 0] }, 'WALL', [], { x: 0, y: 0, angle: 0 }).valid).toBe(false)
    const wall = { x: 0, y: 0, angle: Math.PI / 4, length: 2, thickness: .2 }
    expect(overlapsWall(.5, .5, .1, wall)).toBe(true)
    expect(overlapsWall(.7, -.7, .1, wall)).toBe(false)
  })
  it('재배치와 서로 다른 크기의 교환은 실제 반경으로 검사한다', () => {
    const s = state()
    expect(itemPreview(s, 'RELOCATE', ['p1'], { x: -1, y: .5, angle: 0 }).valid).toBe(true)
    expect(itemPreview(s, 'RELOCATE', ['p1'], { x: 4, y: 2, angle: 0 }).valid).toBe(false)
    expect(itemPreview(s, 'RELOCATE', ['p1'], { x: 0, y: 2, angle: 0 }).valid).toBe(false)
    expect(itemPreview(s, 'SWAP', ['p0', 'p1'], null).valid).toBe(true)
    s.pieces[2] = { ...s.pieces[2], alive: true, x: -1.45, y: 2 }
    expect(itemPreview(s, 'SWAP', ['p0', 'p1'], null).valid).toBe(false)
  })
  it('변형은 상대 알도 허용하고 강화·방어 소유권과 중첩은 검사한다', () => {
    const s = state()
    s.pieces[16] = { ...s.pieces[16], alive: true, x: 2, y: -2 }
    expect(itemPreview(s, 'GROW', ['p16'], null).valid).toBe(true)
    expect(itemPreview(s, 'DEFEND', ['p16'], null).valid).toBe(false)
    expect(itemPreview(s, 'POWER_UP', ['p16'], null).valid).toBe(false)
    expect(itemPreview(s, 'GROW', [], null).valid).toBe(false)
    s.pieces[0].modifier = 'GROW'
    expect(itemPreview(s, 'DEFEND', ['p0'], null).valid).toBe(false)
    expect(itemPreview(s, 'POWER_UP', ['p0'], null).valid).toBe(true)
  })
})

describe('효과음 연결용 승인 이벤트', () => {
  it('첫 접속·재접속은 과거 발사/충돌/결과를 다시 재생하지 않는다', () => {
    const feedback = new AlkkagiFeedback(), s = state()
    s.stage = 'FINISHED'; s.simulationId = 5; s.impacts = [{ id: 4, at: 100, x: 0, y: 0, impulse: 3, kind: 'PIECE' }]
    expect(feedback.update(s)).toEqual([])
    expect(feedback.update(s)).toEqual([])
    feedback.reset(); expect(feedback.update(s)).toEqual([])
  })
  it('발사·실제 충돌·탈락·결과는 새 사건당 한번만 발생한다', () => {
    const feedback = new AlkkagiFeedback(), s = state(); feedback.update(s)
    const shot = { ...s, version: 2, simulationId: 1, stage: 'SIMULATING' as const, serverNow: 110,
      impacts: [{ id: 1, at: 110, x: 0, y: 0, impulse: 3, kind: 'PIECE' }] }
    expect(feedback.update(shot).map(e => e.type)).toEqual(['SHOT', 'PIECE_HIT'])
    expect(feedback.update(shot)).toEqual([])
    const ended = { ...shot, version: 3, stage: 'FINISHED' as const, pieces: shot.pieces.map(p => p.id === 'p0' ? { ...p, alive: false } : p) }
    expect(feedback.update(ended).map(e => e.type)).toEqual(['PIECE_FALL', 'GAME_FINISHED'])
    expect(feedback.update(ended)).toEqual([])
  })
  it('턴 경고와 사용 효과도 중복 생성하지 않는다', () => {
    const feedback = new AlkkagiFeedback(), s = state(); feedback.update(s)
    const next = { ...s, serverNow: 25001, lastItemEffect: { version: 2, turnNumber: 1, actor: 0, type: 'WALL', targets: [] } }
    expect(feedback.update(next).map(e => e.type)).toEqual(['TURN_WARNING', 'ITEM_WALL'])
    expect(feedback.update({ ...next, serverNow: 26000 })).toEqual([])
  })
})

describe('승인 응답과 공개/개인 상태 순서', () => {
  it('승인 직후 밀린 옛 프레임과 다른 버전 손패를 적용하지 않는다', () => {
    const inbox = new AlkkagiInbox(), s = state()
    expect(inbox.publicState(1, s)).toBe(true)
    expect(inbox.privateState(1, s.gameId, 1)).toBe(true)
    inbox.ack(s.gameId, 2)
    expect(inbox.publicState(2, s)).toBe(false)
    expect(inbox.privateState(2, s.gameId, 1)).toBe(false)
    expect(inbox.publicState(3, { ...s, version: 2 })).toBe(true)
    expect(inbox.privateState(3, s.gameId, 1)).toBe(false)
    expect(inbox.privateState(3, s.gameId, 2)).toBe(true)
    expect(inbox.publicState(2, s)).toBe(false)
  })
  it('새 판과 재접속은 이전 승인 하한을 이월하지 않는다', () => {
    const inbox = new AlkkagiInbox(), s = state()
    inbox.publicState(1, s); inbox.ack(s.gameId, 10)
    const fresh = { ...s, gameId: 'new-game', version: 0 }
    expect(inbox.publicState(2, fresh)).toBe(true)
    expect(inbox.privateState(2, fresh.gameId, 0)).toBe(true)
    inbox.reset()
    expect(inbox.publicState(1, s)).toBe(true)
  })
})

describe('여러 벽의 배치 미리보기', () => {
 const wall=(x:number,y:number,angle=0)=>({owner:0,x,y,angle,length:1.6,thickness:.18,expiresAfterTurn:null})
 it('상대가 세개 설치해도 내 한도는 별개이고 기존 모든 벽 겹침을 검사한다',()=>{
   const s={...state(),walls:[wall(-2,0),wall(0,0),wall(2,0)],wallsUsed:[0,3]}
   expect(itemPreview(s,'WALL',[],{x:2,y:.5,angle:0}).valid).toBe(true)
   expect(itemPreview(s,'WALL',[],{x:2,y:0,angle:Math.PI/2}).valid).toBe(false)
   s.wallsUsed=[3,0]
   expect(itemPreview(s,'WALL',[],{x:2,y:.5,angle:0}).valid).toBe(false)
 })
 it('회전벽 교차는 거절하고 평행으로 떨어진 벽은 허용한다',()=>{
   expect(wallsOverlap(wall(0,0,Math.PI/4),wall(0,0,-Math.PI/4))).toBe(true)
   expect(wallsOverlap(wall(0,0,Math.PI/4),wall(0,2,Math.PI/4))).toBe(false)
 })
 it('재배치·확대·교환은 첫벽 이외의 벽도 검사하고 기존 단일벽 상태도 지원한다',()=>{
   const s={...state(),walls:[wall(-2,0),wall(0,0),wall(2,0)]}
   s.pieces[1]={...s.pieces[1],x:2,y:1}
   expect(itemPreview(s,'RELOCATE',['p1'],{x:2,y:0,angle:0}).valid).toBe(false)
   s.pieces[1].y=.35
   expect(itemPreview(s,'GROW',['p1'],null).valid).toBe(false)
   expect(itemPreview(s,'SWAP',['p0','p1'],null).valid).toBe(false)
   expect(itemPreview({...s,walls:undefined,wall:wall(2,0)},'RELOCATE',['p1'],{x:2,y:0,angle:0}).valid).toBe(false)
 })
})
