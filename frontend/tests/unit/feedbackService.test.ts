import { describe, expect, it, vi } from 'vitest'
import { createFeedbackService } from '../../src/features/feedback/service'
import { FeedbackServiceError } from '../../src/features/feedback/contracts'
import { RestError } from '../../src/network/restError'

const submission = { userId: '101', channelId: 'channel-1', operationId: 'feedback-test-1',
  position: { x: -10.8, y: 0.8, z: 14.5, yaw: 0 }, text: '  공원을 개선해주세요.\u200b\n고맙습니다.  ' }
const receipt = { receiptId: '123', acceptedAt: '2026-10-25T00:00:00Z', nextAllowedAt: '2026-10-25T00:00:15Z' }
describe('M07 authenticated feedback REST adapter', () => {
  it('sends only the approved payload, passes cancellation and maps ISO receipts to display milliseconds', async () => {
    const request = vi.fn().mockResolvedValue(receipt), signal = new AbortController().signal
    const service = createFeedbackService(request)
    expect(service.mode).toBe('server')
    expect(await service.submit(submission, signal)).toEqual({ receiptId: '123',
      acceptedAt: Date.parse(receipt.acceptedAt), nextAllowedAt: Date.parse(receipt.nextAllowedAt) })
    expect(request).toHaveBeenCalledWith('/api/v1/feedback', expect.objectContaining({ method: 'POST', signal,
      headers: { 'Content-Type': 'application/json' } }))
    expect(JSON.parse(request.mock.calls[0]![1].body)).toEqual({ operationId: submission.operationId,
      channelId: submission.channelId, text: '공원을 개선해주세요.\n고맙습니다.' })
  })
  it('keeps the same operation and body after an uncertain delivery without automatic retries', async () => {
    const request = vi.fn().mockRejectedValueOnce(new TypeError('fetch failed')).mockResolvedValueOnce(receipt)
    const service = createFeedbackService(request), signal = new AbortController().signal
    await expect(service.submit(submission, signal)).rejects.toMatchObject({ code: 'NETWORK_ERROR' })
    expect(request).toHaveBeenCalledTimes(1)
    await expect(service.submit(submission, signal)).resolves.toMatchObject({ receiptId: '123' })
    expect(request.mock.calls[0]![1].body).toBe(request.mock.calls[1]![1].body)
  })
  it.each([
    [403, 'FEEDBACK_OUT_OF_RANGE'], [409, 'FEEDBACK_ACTIVITY_CONFLICT'], [409, 'IDEMPOTENCY_CONFLICT'],
    [503, 'FEEDBACK_NOT_CONFIGURED'], [503, 'FEEDBACK_UNAVAILABLE'], [404, 'HTTP_ERROR'],
  ])('preserves business failure %s/%s without inventing a receipt', async (status, code) => {
    const service = createFeedbackService(vi.fn().mockRejectedValue(new RestError(Number(status), String(code), '오류')))
    await expect(service.submit(submission, new AbortController().signal)).rejects.toMatchObject({ code })
  })
  it('carries only validated cooldown metadata to the form', async () => {
    const request = vi.fn().mockRejectedValueOnce(new RestError(429, 'FEEDBACK_COOLDOWN', '간격', receipt.nextAllowedAt))
      .mockRejectedValueOnce(new RestError(429, 'FEEDBACK_COOLDOWN', '간격', 'invalid'))
    const service = createFeedbackService(request), signal = new AbortController().signal
    await expect(service.submit(submission, signal)).rejects.toMatchObject({ nextAllowedAt: Date.parse(receipt.nextAllowedAt) })
    await expect(service.submit(submission, signal)).rejects.toMatchObject({ nextAllowedAt: undefined })
  })
  it('rejects malformed success receipts and invalid input without clearing the caller draft', async () => {
    const request = vi.fn(), service = createFeedbackService(request), signal = new AbortController().signal
    for (const value of [{}, { ...receipt, receiptId: 123 }, { ...receipt, acceptedAt: 'invalid' },
      { ...receipt, nextAllowedAt: '2026-10-24T00:00:00Z' }]) {
      request.mockResolvedValueOnce(value)
      await expect(service.submit(submission, signal)).rejects.toBeInstanceOf(FeedbackServiceError)
    }
    request.mockClear()
    await expect(service.submit({ ...submission, operationId: 'bad key' }, signal)).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    await expect(service.submit({ ...submission, text: '짧음' }, signal)).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    expect(request).not.toHaveBeenCalled()
  })
  it('does not send an already aborted request or accept a late acknowledgement after cancellation', async () => {
    const abort = new AbortController(), request = vi.fn().mockImplementation(async () => { abort.abort(); return receipt })
    const service = createFeedbackService(request)
    await expect(service.submit(submission, abort.signal)).rejects.toThrow('취소')
    request.mockClear()
    await expect(service.submit(submission, abort.signal)).rejects.toThrow('취소')
    expect(request).not.toHaveBeenCalled()
  })
})
