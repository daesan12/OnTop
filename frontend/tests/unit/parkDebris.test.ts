import {afterEach,expect,it} from 'vitest'
import {acceptParkDebris,DEBRIS_COINS,DEBRIS_STONES,debrisPieces,debrisVisible,parseParkDebris,resetParkDebris,useParkDebris,type ParkDebris} from '../../src/features/parkDebris/state'
import {debrisLanding,debrisPose} from '../../src/features/parkDebris/motion'
const item:ParkDebris={id:'g:reaction:101',gameId:'g',tableId:'table',anchorId:'table-1',gameCode:'OMOK',userId:'101',
 occurredAt:'2026-10-31T00:00:00Z',throwYaw:0,seed:123,parts:['board',...Array.from({length:12},(_,i)=>'coin-'+i)]}
const state=(version=1)=>({channelId:'one',mapVersion:'map',version,items:[item]})
afterEach(resetParkDebris)
it.each(['OMOK','DICE','ONE_CARD','LIAR_BRIDGE','DICE_LEDGER'] as const)('accepts separate %s pieces and enforces the exact 15-second display boundary',gameCode=>{
 const full={...item,gameCode,parts:[...item.parts,...debrisPieces(gameCode)]}
 expect(parseParkDebris({...state(),items:[full]}).items[0]!.parts).toEqual(full.parts)
 const at=Date.parse(item.occurredAt)
 expect(debrisVisible(full,at-1)).toBe(false)
 expect(debrisVisible(full,at+14_999)).toBe(true)
 expect(debrisVisible(full,at+15_000)).toBe(false)
 expect(()=>parseParkDebris({...state(),items:[{...full,parts:[...full.parts,'card-14']}]})).toThrow()
})
it.each(['OMOK','DICE','ONE_CARD','LIAR_BRIDGE','DICE_LEDGER'] as const)('accepts and retains %s debris from the server snapshot',gameCode=>{
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
  const landed=debrisPose(item,index,3000,1.136,.009)
  expect(landed).toMatchObject({x:landing.x,z:landing.z,y:.009,settled:true})
  expect(debrisPose(item,index,86400000,1.136,.009)).toEqual(landed)
 }
 expect(new Set(points.map(p=>p.join(','))).size).toBe(DEBRIS_STONES)
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
