import { beforeEach, expect, test } from 'vitest'
import { acceptPolice, acceptPatrol, acceptPrivateNotice, resetWorldAi, useWorldAi,npcSpeech } from '../../src/features/ai/worldAi'
beforeEach(resetWorldAi)
test('return and jump snapshots keep one continuous police body without an extra warp',()=>{
 const npc={id:'police',name:'김 순경',action:'TELEPORT_WARNING',x:20,y:18,z:0,yaw:0,moving:false,warp:1}
 for(const [i,action]of ['TELEPORT_WARNING','RETURN_JUMP','RETURN','RETURN_WAIT','PATROL'].entries()) {
  expect(acceptPatrol({version:i,npcs:[{...npc,action,y:18-i*4,moving:action==='RETURN_JUMP'||action==='RETURN'}]})).toBe(true)
  expect(useWorldAi.getState().npcs).toHaveLength(1);expect(useWorldAi.getState().npcs[0]?.warp).toBe(1)
 }
})
test('private waiting notice clears on completion and rejects expired events', () => {
  expect(acceptPrivateNotice({text:'입구 대기 안내',expiresAt:Date.now()+30_000})).toBe(true)
  expect(useWorldAi.getState().privateNotice?.text).toBe('입구 대기 안내')
  expect(acceptPrivateNotice({text:'',expiresAt:Date.now()+30_000})).toBe(true)
  expect(useWorldAi.getState().privateNotice).toBeNull()
  expect(acceptPrivateNotice({text:'지난 안내',expiresAt:Date.now()-1})).toBe(false)
})
test('private game notices retain scope and reject malformed scope data',()=>{
 const event={text:'서로 존중하는 표현을 사용해주세요.',expiresAt:Date.now()+8000,gameId:'game-one'}
 expect(acceptPrivateNotice(event)).toBe(true)
 expect(useWorldAi.getState().privateNotice).toEqual(event)
 expect(acceptPrivateNotice({...event,gameId:123})).toBe(false)
 expect(useWorldAi.getState().privateNotice?.gameId).toBe('game-one')
})
test('patrol snapshots keep one actor while rejecting older and invalid positions', () => {
  const npc={id:'police',name:'김 순경',action:'PATROL',x:0,y:0,z:0,yaw:0,moving:true}
  expect(acceptPatrol({version:1,npcs:[npc]})).toBe(true)
  expect(acceptPatrol({version:2,npcs:[{...npc,action:'RESPOND',x:1}]})).toBe(true)
  expect(useWorldAi.getState().npcs).toHaveLength(1)
  expect(acceptPatrol({version:1,npcs:[npc]})).toBe(false)
  expect(acceptPatrol({version:3,npcs:[{...npc,x:Infinity}]})).toBe(false)
  expect(useWorldAi.getState().npcs[0]?.action).toBe('RESPOND')
})
test('teleport snapshots retain discontinuity and reject invalid warp sequence', () => {
  const npc={id:'police',name:'김 순경',action:'TELEPORT_WARNING',x:50,y:20,z:0,yaw:0,moving:false,warp:1}
  expect(acceptPatrol({version:1,npcs:[npc]})).toBe(true)
  expect(useWorldAi.getState().npcs[0]?.warp).toBe(1)
  expect(acceptPatrol({version:2,npcs:[{...npc,warp:-1}]})).toBe(false)
  expect(acceptPatrol({version:2,npcs:[{...npc,action:'PATROL',x:0,y:0,warp:2}]})).toBe(true)
})
test('police snapshots expire and duplicate incidents stay unique', () => {
  const p={incidentId:'i',name:'김 순경',speech:'서로 존중해주세요.',x:1,y:0,z:2,expiresAt:Date.now()+30_000}
  acceptPolice(p); acceptPolice(p)
  expect(useWorldAi.getState().police).toHaveLength(1)
  acceptPolice({...p,incidentId:'old',expiresAt:Date.now()-1})
  acceptPolice({...p,incidentId:'bad',x:Infinity})
  expect(useWorldAi.getState().police).toHaveLength(1)
})
test('NPC bubbles stay with their speaker and expire before the retained chat history',()=>{
 const now=Date.now(),p={incidentId:'same',name:'김 순경',speech:'서로 존중해주세요.',x:1,y:0,z:2,expiresAt:now+30_000}
 acceptPolice(p,'police');acceptPolice({...p,name:'박영감',speech:'좋은 수로구먼.'},'omok')
 const notices=useWorldAi.getState().police
 expect(npcSpeech(notices,'police',now)?.speech).toBe(p.speech)
 expect(npcSpeech(notices,'omok',now)?.speech).toBe('좋은 수로구먼.')
 expect(npcSpeech(notices,'police',now+10_100)).toBeUndefined()
 expect(notices[0]?.expiresAt).toBe(now+30_000)
})
test('duplicate speech does not restart the bubble lifetime',()=>{
 const p={incidentId:'i',name:'김 순경',speech:'안내',x:1,y:0,z:2,expiresAt:Date.now()+30_000}
 acceptPolice(p);const until=useWorldAi.getState().police[0]!.bubbleUntil
 acceptPolice({...p,expiresAt:p.expiresAt+1000})
 expect(useWorldAi.getState().police[0]!.bubbleUntil).toBe(until)
})
test('different residents at the same table keep independent speech bubbles',()=>{
 const p={incidentId:'same-board:6',name:'동네 초딩',speech:'다음 수가 궁금하다!',x:1,y:0,z:2,expiresAt:Date.now()+30_000}
 acceptPolice(p,'omok-child-one');acceptPolice({...p,name:'동네 주민',speech:'천천히 지켜봐요.'},'omok-neighbor-one')
 expect(npcSpeech(useWorldAi.getState().police,'omok-child-one')?.speech).toBe(p.speech)
 expect(npcSpeech(useWorldAi.getState().police,'omok-neighbor-one')?.speech).toBe('천천히 지켜봐요.')
 expect(npcSpeech(useWorldAi.getState().police,'omok-one')).toBeUndefined()
})
