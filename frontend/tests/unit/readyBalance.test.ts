import { expect,it,vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
vi.mock('../../src/park/runtime/ParkRuntime',()=>({useParkRuntime:()=>({})}))
import { availableForBet,canAffordBet,BetBalanceNotice,startFailureNotice } from '../../src/features/tableLobby/readyBalance'

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
