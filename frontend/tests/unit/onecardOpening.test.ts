import { expect, it } from 'vitest'
import { dealtCount, dealArrival, openingActive, openingAge, openingDuration, SHUFFLE_MS } from '../../src/game/onecard/opening'
import type { OneCard } from '../../src/game/onecard/protocol'

const at=Date.parse('2026-11-01T00:00:00Z')
const state=(count:number)=>({status:'PLAYING',turnCount:1,turnDeadline:new Date(at+30_000).toISOString(),turnTimeLimitMs:30_000,
  players:Array.from({length:count},(_,i)=>({userId:String(i),active:true,cardCount:7}))}) as OneCard
it.each([2,3,4])('shuffles before dealing seven rounds to every seat for %i players',count=>{
 const game=state(count)
 for(let seat=0;seat<count;seat++){
  expect(dealtCount(game,0,String(seat),at+SHUFFLE_MS-1)).toBe(0)
  for(let round=0;round<7;round++){
   const arrival=at+dealArrival(round,seat,count)
   expect(dealtCount(game,0,String(seat),arrival-1)).toBe(round)
   expect(dealtCount(game,0,String(seat),arrival)).toBe(round+1)
  }
 }
 expect(openingActive(game,0,at+openingDuration(count)-1)).toBe(true)
 expect(openingActive(game,0,at+openingDuration(count))).toBe(false)
})
it('does not replay a deal after an action, a late watch/reconnect, or a finished game',()=>{
 const game=state(4)
 expect(openingAge(game,1,at)).toBe(Infinity)
 expect(dealtCount(game,1,'0',at)).toBe(7)
 expect(openingActive(game,0,at+60_000)).toBe(false)
 expect(openingActive({...game,status:'FINISHED'},0,at)).toBe(false)
 expect(openingActive({...game,turnCount:2},0,at)).toBe(false)
 expect(openingActive({...game,players:game.players.map(p=>({...p,cardCount:6}))},0,at)).toBe(false)
})

it('서버 분배 시각으로 재접속 위치를 맞추고 분배가 끝나면 재생하지 않는다', () => {
 const count=4,until=at+openingDuration(count)
 const game={...state(count),dealEndsAt:new Date(until).toISOString(),turnDeadline:new Date(until+30_000).toISOString()}
 expect(openingAge(game,0,at+500)).toBe(500)
 expect(dealtCount(game,0,'0',at+SHUFFLE_MS-1)).toBe(0)
 expect(dealtCount(game,0,'0',until)).toBe(7)
 expect(openingActive(game,0,until+1000)).toBe(false)
})
