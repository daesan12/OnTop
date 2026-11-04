import {afterEach,expect,it} from 'vitest'
import {acceptParkDebris,DEBRIS_COINS,DEBRIS_DURATION,DEBRIS_LAUNCH,DEBRIS_SETTLE,DEBRIS_STONES,debrisPieces,debrisVisible,parseParkDebris,resetParkDebris,useParkDebris,type ParkDebris} from '../../src/features/parkDebris/state'
import {debrisLanding,debrisPose} from '../../src/features/parkDebris/motion'
import {sampleSocialGesture} from '../../src/world/art/socialGestureMotion'
import {SOCIAL_GESTURES} from '../../src/config'
const item:ParkDebris={id:'g:reaction:101',gameId:'g',tableId:'table',anchorId:'table-1',gameCode:'OMOK',userId:'101',
 occurredAt:'2026-10-31T00:00:00Z',throwYaw:0,seed:123,parts:['board',...Array.from({length:12},(_,i)=>'coin-'+i)]}
const state=(version=1)=>({channelId:'one',mapVersion:'map',version,items:[item]})
afterEach(resetParkDebris)
it('does not reinterpret alkkagi as dice debris',()=>{
 expect(debrisPieces('ALKKAGI')).toEqual([])
 expect(()=>parseParkDebris({...state(),items:[{...item,gameCode:'ALKKAGI',parts:[...item.parts,'die-0']}]})).toThrow()
})
it.each(['OMOK','DICE','ONE_CARD','LIAR_BRIDGE','DICE_LEDGER'] as const)('accepts separate %s pieces and enforces the exact 15-second display boundary',gameCode=>{
 const full={...item,gameCode,parts:[...item.parts,...debrisPieces(gameCode)]}
 expect(parseParkDebris({...state(),items:[full]}).items[0]!.parts).toEqual(full.parts)
 const at=Date.parse(item.occurredAt)
 expect(debrisVisible(full,at-1)).toBe(false)
 expect(debrisVisible(full,at+14_999)).toBe(true)
 expect(debrisVisible(full,at+15_000)).toBe(false)
 expect(()=>parseParkDebris({...state(),items:[{...full,parts:[...full.parts,'card-14']}]})).toThrow()
})
it.each(['OMOK','DICE','ONE_CARD','LIAR_BRIDGE','DICE_LEDGER','ALKKAGI'] as const)('accepts and retains %s debris from the server snapshot',gameCode=>{
 const parsed=parseParkDebris({...state(),items:[{...item,gameCode}]})
 expect(acceptParkDebris(parsed)).toBe(true)
 expect(useParkDebris.getState().items[0]!.gameCode).toBe(gameCode)
})
it('replaces a versioned full snapshot, retaining later-join dirt and applying server cleaning without local rewards',()=>{
 expect(acceptParkDebris(parseParkDebris(state()))).toBe(true)
 expect(acceptParkDebris(parseParkDebris({...state(),items:[]}))).toBe(false)
 expect(useParkDebris.getState().items).toHaveLength(1)
 expect(acceptParkDebris(parseParkDebris({...state(2),items:[{...item,parts:['board']}]}))).toBe(true)
 expect(useParkDebris.getState().items[0]!.parts).toEqual(['board'])
 expect(acceptParkDebris(parseParkDebris({...state(3),items:[]}))).toBe(true)
 expect(useParkDebris.getState().items).toEqual([])
})
it('rejects malformed, duplicate, unbounded and unknown objects',()=>{
 for(const patch of [{throwYaw:NaN},{seed:-1},{parts:['coin-12']},{parts:['coin-0','coin-0']},{gameCode:'BAD'},{occurredAt:'bad'}])
  expect(()=>parseParkDebris({...state(),items:[{...item,...patch}]})).toThrow()
 expect(()=>parseParkDebris({...state(),items:[item,item]})).toThrow()
 expect(()=>parseParkDebris({...state(),items:Array(65).fill(item)})).toThrow()
})
it('samples a deterministic flight and leaves the board and all coins resting on the supplied floor indefinitely',()=>{
 for(let index=-1;index<12;index++){
  const landing=debrisLanding(item,index)
  expect(Math.hypot(landing.x,landing.z)).toBeGreaterThan(1)
  expect(Math.hypot(landing.x,landing.z)).toBeLessThan(4)
  expect(debrisPose(item,index,100,1.1,.045).visible).toBe(false)
  expect(debrisPose(item,index,1200,1.1,.045).y).toBeGreaterThan(1.1)
  const settled=debrisPose(item,index,4000,1.1,.045)
  expect(settled.settled).toBe(true);expect(settled.y).toBeCloseTo(.045)
  expect(debrisPose(item,index,86400000,1.1,.045)).toEqual({...settled,y:.045})
 }
})
it('keeps every scattered stone off the board with independent flights and repeatable floor positions',()=>{
 const board=debrisLanding(item,-1),points=[]
 for(let stone=0;stone<DEBRIS_STONES;stone++){
  const index=DEBRIS_COINS+stone,landing=debrisLanding(item,index)
  expect(Math.hypot(landing.x-board.x,landing.z-board.z)).toBeGreaterThan(1)
  const flying=debrisPose(item,index,1200,1.136,.009)
  expect(flying.y).toBeGreaterThan(1.136)
  points.push([flying.x,flying.z])
  const landed=debrisPose(item,index,DEBRIS_SETTLE,1.136,.009)
  expect(landed).toMatchObject({x:landing.x,z:landing.z,y:.009,settled:true})
  expect(debrisPose(item,index,86400000,1.136,.009)).toEqual(landed)
 }
 expect(new Set(points.map(p=>p.join(','))).size).toBe(DEBRIS_STONES)
})
it('오목판은 서버가 정한 상대 방향으로 날아가고 반대 좌석은 반대편에 도착한다',()=>{
 const south=debrisLanding({...item,throwYaw:Math.PI},-1),north=debrisLanding({...item,throwYaw:0},-1)
 expect(south.x).toBeCloseTo(0);expect(south.z).toBeLessThan(0)
 expect(north.x).toBeCloseTo(0);expect(north.z).toBeGreaterThan(0)
 expect(Math.abs(south.z)).toBeCloseTo(Math.abs(north.z))
})
it('accepts and individually cleans stone parts only for omok while retaining the board and coins',()=>{
 const full={...item,parts:[...item.parts,...Array.from({length:DEBRIS_STONES},(_,i)=>'stone-'+i)]}
 expect(acceptParkDebris(parseParkDebris({...state(),items:[full]}))).toBe(true)
 expect(useParkDebris.getState().items[0]!.parts).toHaveLength(18)
 acceptParkDebris(parseParkDebris({...state(2),items:[{...full,parts:full.parts.filter(p=>p!=='stone-0')}]}))
 expect(useParkDebris.getState().items[0]!.parts).toHaveLength(17)
 expect(useParkDebris.getState().items[0]!.parts).toContain('board')
 expect(()=>parseParkDebris({...state(),items:[{...full,gameCode:'DICE_LEDGER'}]})).toThrow()
 expect(()=>parseParkDebris({...state(),items:[{...item,parts:['stone-5']}]})).toThrow()
})
// 판 엎기 동작의 어깨 각(위로 퍼 올릴수록 더 음수)을 같은 서버 경과 시간으로 표본화한다.
const shoulderAt=(age:number)=>{let x=0;sampleSocialGesture('EMOTE_TABLE_FLIP',age,(joint,v=0)=>{if(joint==='upperArm_R')x=v});return x}
it('판은 캐릭터가 손으로 판을 위로 밀어 올리기 시작한 직후, 최대 힘 순간 이전에 날아간다',()=>{
 // 1ms 간격 어깨 상승 속도(rad/ms). 앞으로 뻗는 동작(240→750)은 제외하고 퍼 올리기 구간을 찾는다.
 let peakAt=0,peak=0
 for(let t=900;t<1800;t++){const v=shoulderAt(t)-shoulderAt(t+1);if(v>peak){peak=v;peakAt=t}}
 let onset=peakAt
 while(onset>900&&shoulderAt(onset-1)-shoulderAt(onset)>peak*.2)onset--
 expect(onset).toBeGreaterThan(1000)
 expect(DEBRIS_LAUNCH).toBeGreaterThanOrEqual(onset)
 expect(DEBRIS_LAUNCH).toBeLessThanOrEqual(peakAt)
 // 발사 시점에 손은 이미 위로 움직이고 있고, 그 직전 손은 아래(멈춤 구간)에 있다.
 expect(shoulderAt(DEBRIS_LAUNCH)).toBeLessThan(shoulderAt(onset-50))
 expect(debrisPose(item,-1,DEBRIS_LAUNCH-1,1.09,.045).visible).toBe(false)
 expect(debrisPose(item,-1,DEBRIS_LAUNCH,1.09,.045).visible).toBe(true)
 // 판이 공중에 있는 동안 캐릭터 동작은 끝나지 않았고, 연출 창은 마지막 조각이 안착한 뒤에 끝난다.
 expect(DEBRIS_LAUNCH+1650).toBeLessThanOrEqual(SOCIAL_GESTURES.EMOTE_TABLE_FLIP.durationMs)
 expect(DEBRIS_DURATION).toBeGreaterThan(DEBRIS_SETTLE)
})
it.each(['OMOK','ONE_CARD','DICE'] as const)('%s 조각은 안착 시각 전에 비행을 끝내 바닥으로 순간이동하지 않는다',gameCode=>{
 const full={...item,gameCode},count=DEBRIS_COINS+debrisPieces(gameCode).length
 for(let index=-1;index<count;index++){
  const before=debrisPose(full,index,DEBRIS_SETTLE-1,1.1,.045),after=debrisPose(full,index,DEBRIS_SETTLE,1.1,.045)
  expect(before.settled).toBe(false)
  expect(Math.abs(before.y-after.y)).toBeLessThan(.01)
  expect(Math.hypot(before.x-after.x,before.z-after.z)).toBeLessThan(1e-9)
 }
})
it.each([20,30,60,144])('%sfps 프레임 간격에서도 발사 프레임 지연은 한 프레임 이내이고 같은 시각의 자세는 동일하다',fps=>{
 const dt=1000/fps,occurred=0.37*dt
 let first=Infinity
 for(let frame=0;frame*dt<DEBRIS_DURATION;frame++){
  const age=frame*dt-occurred
  if(age>=0&&debrisPose(item,-1,age,1.09,.045).visible){first=age;break}
 }
 expect(first-DEBRIS_LAUNCH).toBeGreaterThanOrEqual(0)
 expect(first-DEBRIS_LAUNCH).toBeLessThan(dt)
 expect(debrisPose(item,-1,1500,1.09,.045)).toEqual(debrisPose(item,-1,1500,1.09,.045))
})
