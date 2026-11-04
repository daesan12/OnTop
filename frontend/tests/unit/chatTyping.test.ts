import {afterEach,expect,it,vi} from 'vitest'
import {TypingReporter} from '../../src/features/chat/typingReporter'
import {acceptTyping,resetTyping,useTyping} from '../../src/features/chat/typingState'

afterEach(()=>{vi.useRealTimers();resetTyping()})

it('연속 입력은 매 글자를 보내지 않고 heartbeat만 보내며 쉬거나 닫으면 중지한다',()=>{
  vi.useFakeTimers()
  const send=vi.fn(),reporter=new TypingReporter(send)
  for(let i=0;i<20;i++)reporter.changed(true)
  expect(send.mock.calls).toEqual([[true]])
  vi.advanceTimersByTime(2000)
  expect(send.mock.calls).toEqual([[true],[true]])
  reporter.changed(true)
  vi.advanceTimersByTime(1000)
  expect(send).not.toHaveBeenCalledWith(false)
  reporter.stop()
  expect(send.mock.calls.at(-1)).toEqual([false])
  const count=send.mock.calls.length
  vi.advanceTimersByTime(10000)
  expect(send).toHaveBeenCalledTimes(count)
})

it('입력을 멈추거나 지우면 3초 안에 해제하고 실패가 채팅을 막지 않는다',async()=>{
  vi.useFakeTimers()
  const send=vi.fn(()=>Promise.reject(new Error('offline'))),reporter=new TypingReporter(send)
  reporter.changed(true);vi.advanceTimersByTime(3000)
  expect(send.mock.calls.at(-1)).toEqual([false])
  reporter.changed(true);reporter.changed(false)
  expect(send.mock.calls.at(-1)).toEqual([false])
  reporter.stop();await Promise.resolve()
})

it('다른 채널·역순은 무시하고 수명은 최대5초이며 중지 snapshot으로 제거한다',()=>{
  const state={channelId:'one',version:1,users:[{userId:'101',expiresInMs:5000}]}
  acceptTyping(state,'two',100)
  expect(useTyping.getState().users).toEqual({})
  acceptTyping(state,'one',100)
  expect(useTyping.getState().users).toEqual({'101':5100})
  acceptTyping({...state,version:0,users:[]},'one',1000)
  expect(useTyping.getState().users).toEqual({'101':5100})
  expect(()=>acceptTyping({...state,version:2,users:[{userId:'101',expiresInMs:5001}]},'one')).toThrow()
  acceptTyping({...state,version:2,users:[]},'one')
  expect(useTyping.getState().users).toEqual({})
})
