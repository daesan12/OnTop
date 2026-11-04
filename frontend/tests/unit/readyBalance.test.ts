import { afterEach,expect,it,vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
vi.mock('../../src/park/runtime/ParkRuntime',()=>({useParkRuntime:()=>({})}))
import { availableForBet,canAffordBet,BetBalanceNotice,startFailureNotice } from '../../src/features/tableLobby/readyBalance'
import { receive,resetWorld,useSession } from '../../src/network/worldClient'
afterEach(()=>resetWorld())

it('uses available money and blocks insufficient, unknown and invalid stakes',()=>{
  const available=availableForBet({balance:100,reservedBalance:20,availableBalance:80})
  expect(available).toBe(80)
  const balance={status:'ready' as const,available}
  expect(canAffordBet(balance,80)).toBe(true);expect(canAffordBet(balance,81)).toBe(false)
  expect(canAffordBet(balance,-1)).toBe(false);expect(canAffordBet(balance,NaN)).toBe(false)
  expect(canAffordBet({status:'loading',available:null},0)).toBe(false)
  expect(canAffordBet({status:'error',available:100},0)).toBe(false)
  expect(()=>availableForBet({balance:100,reservedBalance:20,availableBalance:100})).toThrow()
})
it('shows the exact shortfall without treating a failed read as zero',()=>{
  const html=renderToStaticMarkup(createElement(BetBalanceNotice,{balance:{status:'ready',available:80},bet:100,retry(){}}))
  expect(html).toContain('80');expect(html).toContain('20');expect(html).toContain('냥 부족해요')
  const error=renderToStaticMarkup(createElement(BetBalanceNotice,{balance:{status:'error',available:null},bet:100,retry(){}}))
  expect(error).toContain('잔액 다시 확인');expect(error).not.toContain('100냥 부족')
})
it('explains reservation-time insufficiency after the server has reset readiness',()=>{
  expect(startFailureNotice({phase:'WAITING',code:'INSUFFICIENT_BALANCE'} as never)).toContain('잔액이 부족')
  expect(startFailureNotice({phase:'PLAYING',code:'INSUFFICIENT_BALANCE'} as never)).toBe('')
})
it('re-evaluates the latest received bet after an async ready rejection without restoring an older table',()=>{
  const table={tableId:'ready-review',version:1,capacity:2,minimumPlayers:2,allReady:false,gameId:null,
    selectorUserId:'101',gameCode:'OMOK',betAmountPerPlayer:50,targetScore:null,
    seats:[{seatNumber:1,userId:'101',ready:false},{seatNumber:2,userId:null,ready:false}]}
  useSession.setState({sessionId:'101',tables:[{tableId:table.tableId}] as never,tableStates:{}})
  const emit=(payload:Record<string,unknown>)=>receive({type:'TABLE_STATE',requestId:null,payload})
  const balance={status:'ready' as const,available:80}
  emit(table)
  expect(canAffordBet(balance,useSession.getState().tableStates[table.tableId]!.betAmountPerPlayer)).toBe(true)
  emit({...table,version:2,betAmountPerPlayer:100})
  receive({type:'ERROR',requestId:'old-ready',payload:{code:'GAME_BET_CHANGED',message:'현재 참가비를 확인해주세요.'}})
  emit(table) // delayed older snapshot cannot restore the old, affordable stake
  const current=useSession.getState().tableStates[table.tableId]!
  expect(current.version).toBe(2);expect(current.betAmountPerPlayer).toBe(100)
  expect(current.seats[0]!.ready).toBe(false)
  expect(canAffordBet(balance,current.betAmountPerPlayer)).toBe(false)
  expect(renderToStaticMarkup(createElement(BetBalanceNotice,{balance,bet:current.betAmountPerPlayer,retry(){}}))).toContain('20냥 부족해요')
  emit({...table,version:3,gameCode:'DICE',betAmountPerPlayer:100,targetScore:2000})
  receive({type:'ERROR',requestId:'other-old-ready',payload:{code:'GAME_SETTINGS_CHANGED',message:'현재 설정을 확인해주세요.'}})
  expect(useSession.getState().tableStates[table.tableId]!.gameCode).toBe('DICE')
  expect(canAffordBet({...balance,available:100},useSession.getState().tableStates[table.tableId]!.betAmountPerPlayer)).toBe(true)
})
