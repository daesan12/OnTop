import { afterEach, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { parseMachine, parseState } from '../../src/features/gacha/contracts'
import { gachaClock, refillRemaining } from '../../src/features/gacha/timing'
import { RefillNotice } from '../../src/features/gacha/RefillNotice'

const start='2026-11-07T10:00:00.000Z'
const value={roundId:'2',version:1,remaining:30,refillEndsAt:'2026-11-07T10:00:03.000Z',
  prizes:[1,2,4,8,15].map((n,i)=>({grade:i+1,initial:n,remaining:n,value:100}))}
afterEach(()=>{gachaClock.reset();vi.restoreAllMocks()})
it('기기 시계가 바뀌거나 지연 이벤트를 받아도 보충 종료를 다시 시작하지 않는다',()=>{
  const machine=parseMachine(value);gachaClock.sync(Date.parse(start),1000)
  expect(refillRemaining(machine,2000)).toBe(2000)
  vi.spyOn(Date,'now').mockReturnValue(0)
  expect(refillRemaining(machine,3000)).toBe(1000)
  expect(refillRemaining(machine,4000)).toBe(0)
  expect(refillRemaining(machine,9000)).toBe(0)
})
it('보충 종료 시각이 있으면 서버 시각을 확인하기 전에는 닫고 잘못된 시각은 거절한다',()=>{
  expect(refillRemaining(parseMachine(value),1000)).toBe(3000)
  expect(()=>parseMachine({...value,refillEndsAt:'broken'})).toThrow()
  expect(()=>parseState({enabled:true,ticketPrice:100,machine:value,inventory:null,products:[]})).toThrow()
})
it('보충 중과 완료 후 안내를 구분하고 완료 안내는 재고 표를 가리지 않는다',()=>{
  const filling=renderToStaticMarkup(createElement(RefillNotice,{remaining:1800,transition:'ROUND_ENDED'}))
  expect(filling).toContain('이번 뽑기가 종료됐어요')
  expect(filling).toContain('뽑기권은 사용하지 않았어요')
  expect(filling).toContain('aria-valuenow="1200"')
  const ready=renderToStaticMarkup(createElement(RefillNotice,{remaining:0,transition:'ROUND_ENDED'}))
  expect(ready).toContain('art-refill-ready');expect(ready).not.toContain('progressbar')
  expect(ready).toContain('다시 눌러')
})
