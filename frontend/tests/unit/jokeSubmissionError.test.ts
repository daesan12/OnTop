import { describe, expect, it } from 'vitest'
import { RestError } from '../../src/network/restError'
import { jokeBusinessMessage, jokeSubmissionError, jokeSubmissionPath } from '../../src/features/ai/jokeSubmissionError'

describe('joke submission errors', () => {
  it('shows the actual business reason instead of a quota/distance checklist', () => {
    for (const [status, message] of [[400, '잠시 후 다시 제출해주세요.'], [403, '아재 심사위원 가까이에서 제출해주세요.'], [409, '현재 요청을 다시 확인해주세요.']] as const) {
      const reason = jokeBusinessMessage(jokeSubmissionPath, status, { message })
      expect(reason).toBe(message)
      expect(jokeSubmissionError(new RestError(status, 'HTTP_ERROR', reason!))).toBe(message)
    }
  })
  it('does not expose server failures or messages from other endpoints', () => {
    expect(jokeBusinessMessage(jokeSubmissionPath, 500, { message: 'internal details' })).toBeUndefined()
    expect(jokeBusinessMessage('/api/v1/users/me', 400, { message: 'unrelated' })).toBeUndefined()
    expect(jokeBusinessMessage(jokeSubmissionPath, 400, { message: 'stack\ntrace' })).toBeUndefined()
    expect(jokeSubmissionError(new RestError(500, 'HTTP_ERROR', 'internal details'))).not.toContain('internal details')
    expect(jokeSubmissionError(new TypeError('Failed to fetch'))).toContain('같은 입력')
    expect(jokeSubmissionError(new RestError(401, 'HTTP_ERROR', 'error'))).toContain('로그인')
  })
})
