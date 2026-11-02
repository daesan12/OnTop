import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { resetEmotes, useEmoteState } from '../../src/features/emotes/state'

beforeEach(() => { resetEmotes(true); vi.useFakeTimers() })
afterEach(() => { resetEmotes(true); vi.useRealTimers() })

it.each(['notice', 'error'] as const)('expires emote %s after two seconds without changing request or cooldown state', field => {
  useEmoteState.setState({ pending: true, requestId: 'current', requested: 'EMOTE_WAVE', readyAt: 9000,
    [field]: '감정표현이 취소되었습니다. 멈춘 뒤 다른 감정표현을 사용할 수 있어요.' })
  vi.advanceTimersByTime(1999)
  expect(useEmoteState.getState()[field]).not.toBe('')
  vi.advanceTimersByTime(1)
  expect(useEmoteState.getState()).toMatchObject({ error: '', notice: '', pending: true,
    requestId: 'current', requested: 'EMOTE_WAVE', readyAt: 9000, cancelled: false })
})

it('does not let the old feedback timer erase a newer message', () => {
  useEmoteState.setState({ notice: '첫 안내' })
  vi.advanceTimersByTime(1000)
  useEmoteState.setState({ notice: '', error: '새 안내' })
  vi.advanceTimersByTime(1000)
  expect(useEmoteState.getState().error).toBe('새 안내')
  vi.advanceTimersByTime(1000)
  expect(useEmoteState.getState().error).toBe('')
})

it('cleans up feedback on reset without allowing an old channel timer to clear the next notice', () => {
  useEmoteState.setState({ notice: '안내' })
  vi.advanceTimersByTime(1000)
  resetEmotes()
  expect(useEmoteState.getState().notice).toBe('')
  useEmoteState.setState({ notice: '안내' })
  vi.advanceTimersByTime(1000)
  expect(useEmoteState.getState().notice).toBe('안내')
  vi.advanceTimersByTime(1000)
  expect(useEmoteState.getState().notice).toBe('')
})
