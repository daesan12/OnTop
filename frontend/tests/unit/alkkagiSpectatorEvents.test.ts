import { afterEach, expect, test } from 'vitest'
import { acceptAlkkagiSocial, alkkagiSocialView, resetAlkkagiSocial, syncAlkkagiSocial, useAlkkagiSocial } from '../../src/game/alkkagi/spectatorEvents'
const event = (kind = 'CURSOR') => ({requestId:null,type:'ALKKAGI_SPECTATOR_EVENT',payload:{gameId:'g',eventId:crypto.randomUUID(),senderUserId:'505',kind,
  turnNumber:2,basedOnVersion:3,sentAt:1000,serverNow:1000,expiresAt:kind==='CURSOR'?3000:5000,x:1,y:2,pieceId:'p0',dx:1,dy:0,power:.5}})
afterEach(resetAlkkagiSocial)
test('동일 사건은 한 번만 표시하고 다른 경기·만료는 버린다',()=>{
  const e=event();acceptAlkkagiSocial(e,'other');expect(useAlkkagiSocial.getState().marks).toHaveLength(0)
  acceptAlkkagiSocial(e,'g');acceptAlkkagiSocial(e,'g');expect(useAlkkagiSocial.getState().marks).toHaveLength(1)
  const expired=event();expired.payload.serverNow=3000;acceptAlkkagiSocial(expired,'g');expect(useAlkkagiSocial.getState().marks).toHaveLength(1)
})
test('차례·조준 상태가 달라지면 훈수를 보여주지 않는다',()=>{
  acceptAlkkagiSocial(event('ADVICE'),'g');expect(alkkagiSocialView('g',2,true,'101').advice).toHaveLength(1)
  expect(alkkagiSocialView('g',3,true,'101').advice).toHaveLength(0)
  expect(alkkagiSocialView('g',2,false,'101').advice).toHaveLength(0)
  expect(alkkagiSocialView('other',2,true,'101').advice).toHaveLength(0)
})
test('자신의 커서는 숨기고 비정상 좌표는 버린다',()=>{
  acceptAlkkagiSocial(event(),'g');expect(alkkagiSocialView('g',2,true,'505').cursors).toHaveLength(0)
  expect(alkkagiSocialView('g',2,true,'101').cursors).toHaveLength(1)
  const bad=event();bad.payload.x=20;acceptAlkkagiSocial(bad,'g');expect(useAlkkagiSocial.getState().marks).toHaveLength(1)
})

test('같은 턴 추가발사에서 예전 훈수가 재등장하지 않는다',()=>{
  acceptAlkkagiSocial(event('ADVICE'),'g');syncAlkkagiSocial('g',3,false);syncAlkkagiSocial('g',3,true)
  expect(alkkagiSocialView('g',2,true,'101').advice).toHaveLength(0)
  acceptAlkkagiSocial(event('ADVICE'),'g',4);expect(useAlkkagiSocial.getState().marks).toHaveLength(0)
})
test('전송 지연을 반영하고 수신 시 이미 만료된 표시는 버린다',()=>{
  const e=event();const before=performance.now();acceptAlkkagiSocial(e,'g',3,2500)
  expect(useAlkkagiSocial.getState().marks[0].until-before).toBeLessThanOrEqual(510)
  resetAlkkagiSocial();acceptAlkkagiSocial(event(),'g',3,3100);expect(useAlkkagiSocial.getState().marks).toHaveLength(0)
})
