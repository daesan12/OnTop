import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAILBOX } from '../../src/park/mapConfig'
import { closeFeedback, openFeedback, submitFeedback } from '../../src/features/feedback/controller'
import { MockFeedbackService } from '../../src/features/feedback/mock/MockFeedbackService'
import { feedbackService } from '../../src/features/feedback/service'
import { editFeedbackDraft, useFeedbackState } from '../../src/features/feedback/state'
import { canReachFeedback, FEEDBACK_TIMEOUT_MS, parseFeedbackText } from '../../src/features/feedback/validation'
import { clearChannel, receive, resetWorld, useSession } from '../../src/network/worldClient'
import { EXPECTED_MAP_VERSION } from '../../src/config/mapVersion'
import { inputState, roamingInput } from '../../src/world/inputOwnership'
import { interactionAim } from '../../src/features/interactions/interactionAim'
import { getParkInteraction } from '../../src/features/interactions/parkInteraction'
import { useFitnessState } from '../../src/features/fitness/state'
import { FeedbackServiceError, type FeedbackReceipt } from '../../src/features/feedback/contracts'
import type { Pose } from '../../src/network/worldClient'

vi.mock('../../src/features/feedback/service', async () => {
  const { MockFeedbackService } = await import('../../src/features/feedback/mock/MockFeedbackService')
  return { feedbackService: new MockFeedbackService() }
})
const near: Pose = { x: MAILBOX.x, y: 0.8, z: MAILBOX.z + 1.8, yaw: 0 }
const body = '공원에 바라는 점입니다.'
const emit = (type: string, payload: Record<string, unknown>) => receive({ type, payload, requestId: null })
function world(version = 1, position = near, mapVersion = EXPECTED_MAP_VERSION) {
  emit('WORLD_STATE', { channelId: 'a', version, mapVersion, avatars: ['101', '102'].map(userId => ({ userId,
    position: { ...position, lastInputSeq: 0, moving: false, running: false, swimming: false } })) })
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(Date.now() + 60_000)
  resetWorld()
  interactionAim.ready = false
  roamingInput.ready = true
  for (const key of Object.keys(inputState) as (keyof typeof inputState)[]) inputState[key] = false
  emit('CONNECTED', { userId: '101' })
  emit('CHANNEL_STATE', { channelId: 'a', name: '공원', version: 1, currentUsers: 2, capacity: 4, userIds: ['101', '102'] })
  world()
})
afterEach(() => { vi.restoreAllMocks(); resetWorld(); roamingInput.ready = false; vi.useRealTimers() })
const finish = async <T>(pending: Promise<T>) => { await vi.advanceTimersByTimeAsync(300); return pending }
const compose = () => { expect(openFeedback()).toBe(true); editFeedbackDraft(body) }
const receipt = (): FeedbackReceipt => ({ receiptId: 'approved', acceptedAt: Date.now(), nextAllowedAt: Date.now() + 15_000 })

describe('M07 private feedback validation and request lifecycle', () => {
  it('uses the server cooldown deadline and retains the same retry operation until approval', async () => {
    compose()
    const nextAllowedAt = Date.now() + 15_000
    const send = vi.spyOn(feedbackService, 'submit')
      .mockRejectedValueOnce(new FeedbackServiceError('FEEDBACK_COOLDOWN', '잠시 후', nextAllowedAt))
      .mockResolvedValueOnce(receipt())
    expect(await submitFeedback()).toBe(false)
    const operationId = useFeedbackState.getState().operationId
    expect(useFeedbackState.getState()).toMatchObject({ draft: body, nextAllowedAt, pending: false })
    expect(await submitFeedback()).toBe(false)
    expect(send).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(15_001)
    expect(await submitFeedback()).toBe(true)
    expect(send.mock.calls[1]![0].operationId).toBe(operationId)
  })
  it('validates raw/normalized 5~600 characters, NFC and controls while keeping newlines', () => {
    expect(parseFeedbackText('  공원 의견입니다.\n고맙습니다\u200b\u0000 ')).toBe('공원 의견입니다.\n고맙습니다')
    expect(parseFeedbackText('가'.repeat(5).normalize('NFD'))).toBe('가'.repeat(5))
    expect(parseFeedbackText('가'.repeat(600))).toHaveLength(600)
    for (const invalid of ['네 글자', ' '.repeat(10), '가'.repeat(601), '\u200b'.repeat(10)]) expect(parseFeedbackText(invalid)).toBeNull()
  })
  it('uses the existing ground anchor, checks height/distance and shares the E target', () => {
    expect(canReachFeedback(near)).toBe(true)
    expect(canReachFeedback({ ...near, y: 10 })).toBe(false)
    expect(canReachFeedback({ ...near, x: near.x + 10 })).toBe(false)
    expect(canReachFeedback({ ...near, x: NaN })).toBe(false)
    expect(getParkInteraction()).toMatchObject({ kind: 'feedback', id: 'feedback-mailbox', available: true })
    useFitnessState.setState({ pending: true })
    expect(openFeedback()).toBe(false)
  })
  it('keeps idempotent receipts private, rejects a changed payload for the same key and applies cooldown after success', async () => {
    const service = new MockFeedbackService(), signal = new AbortController().signal
    const submission = { userId: '101', channelId: 'a', operationId: 'first', position: near, text: body }
    const a = service.submit(submission, signal), b = service.submit(submission, signal)
    await vi.advanceTimersByTimeAsync(300)
    const first = await a
    expect(await b).toEqual(first)
    expect(first).not.toHaveProperty('text')
    expect(Object.keys(service)).not.toContain('receipts')
    const changed = expect(service.submit({ ...submission, text: '다른 내용입니다.' }, signal)).rejects.toThrow('다른 내용')
    await vi.advanceTimersByTimeAsync(300); await changed
    const rapid = expect(service.submit({ ...submission, operationId: 'second' }, signal)).rejects.toThrow('잠시 후')
    await vi.advanceTimersByTimeAsync(300); await rapid
    await vi.advanceTimersByTimeAsync(15_000)
    expect((await finish(service.submit({ ...submission, operationId: 'second' }, signal))).receiptId).not.toBe(first.receiptId)
  })
  it('rejects out-of-range direct service submissions and cancellations without accepting a receipt', async () => {
    const service = new MockFeedbackService(), abort = new AbortController()
    const submission = { userId: '101', channelId: 'a', operationId: 'key', position: { ...near, y: 12 }, text: body }
    const rejected = expect(service.submit(submission, abort.signal)).rejects.toThrow('지상 소리함')
    await vi.advanceTimersByTimeAsync(300); await rejected
    const cancelled = expect(service.submit({ ...submission, position: near }, abort.signal)).rejects.toThrow('취소')
    abort.abort(); await cancelled
  })
  it('does not erase text before approval and prevents duplicate clicks', async () => {
    compose()
    const request = submitFeedback()
    expect(useFeedbackState.getState()).toMatchObject({ pending: true, draft: body })
    expect(await submitFeedback()).toBe(false)
    expect(await finish(request)).toBe(true)
    expect(useFeedbackState.getState()).toMatchObject({ pending: false, draft: '', operationId: '' })
    expect(useFeedbackState.getState().notice).toContain('실제 관리자')
  })
  it('retains the exact draft and operation on failure, retries the same key and clears it only on acknowledgement', async () => {
    compose()
    editFeedbackDraft('  ' + body + '\n')
    const send = vi.spyOn(feedbackService, 'submit').mockRejectedValueOnce(new Error('저장 실패')).mockResolvedValueOnce(receipt())
    expect(await submitFeedback()).toBe(false)
    const failed = useFeedbackState.getState()
    expect(failed.draft).toBe('  ' + body + '\n')
    expect(failed.error).toBe('저장 실패')
    expect(await submitFeedback()).toBe(true)
    expect(send.mock.calls[0]![0].operationId).toBe(send.mock.calls[1]![0].operationId)
    expect(send.mock.calls[0]![0].text).toBe(body)
    expect(useFeedbackState.getState().draft).toBe('')
  })
  it('settles a non-cooperating timeout, keeps the same retry key and ignores its late success', async () => {
    compose()
    let complete!: (value: FeedbackReceipt) => void
    const send = vi.spyOn(feedbackService, 'submit').mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
    const pending = submitFeedback()
    await vi.advanceTimersByTimeAsync(FEEDBACK_TIMEOUT_MS + 1)
    expect(await pending).toBe(false)
    const key = useFeedbackState.getState().operationId
    expect(useFeedbackState.getState()).toMatchObject({ pending: false, draft: body })
    expect(useFeedbackState.getState().error).toContain('초과')
    expect(send.mock.calls[0]![1].aborted).toBe(true)
    complete(receipt()); await Promise.resolve()
    expect(useFeedbackState.getState().draft).toBe(body)
    send.mockResolvedValueOnce(receipt())
    expect(await submitFeedback()).toBe(true)
    expect(send.mock.calls[1]![0].operationId).toBe(key)
  })
  it('cancels on close, preserves a retry draft and never lets a previous response erase a new visit', async () => {
    compose()
    let complete!: (value: FeedbackReceipt) => void
    vi.spyOn(feedbackService, 'submit').mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
    const pending = submitFeedback()
    await vi.advanceTimersByTimeAsync(1)
    closeFeedback()
    expect(await pending).toBe(false)
    expect(inputState.feedbackOpen).toBe(false)
    expect(openFeedback()).toBe(true)
    editFeedbackDraft('새로 작성하는 의견입니다.')
    complete(receipt()); await Promise.resolve()
    expect(useFeedbackState.getState().draft).toBe('새로 작성하는 의견입니다.')
  })
  it('rechecks the real position before submit and cancels in-flight work on a forced position change', async () => {
    compose()
    world(2, { ...near, y: 10 })
    expect(useFeedbackState.getState().open).toBe(false)
    expect(await submitFeedback()).toBe(false)
    world(3)
    compose()
    const request = submitFeedback()
    world(4, { ...near, x: near.x + 10 })
    expect(await finish(request)).toBe(false)
    expect(useFeedbackState.getState()).toMatchObject({ draft: body, open: false, pending: false })
  })
  it('preserves the same-user draft on reconnect but clears it on logout, channel change or another identity', () => {
    compose()
    resetWorld('reconnecting')
    expect(useFeedbackState.getState()).toMatchObject({ open: false, draft: body, pending: false })
    emit('CONNECTED', { userId: '101' })
    expect(useFeedbackState.getState().draft).toBe(body)
    clearChannel(true)
    expect(useFeedbackState.getState().draft).toBe(body)
    emit('CONNECTED', { userId: 'other' })
    expect(useFeedbackState.getState().draft).toBe('')
    useSession.setState({ sessionId: '101', roomId: 'a', status: 'connected', mapCompatible: true }); world()
    compose(); clearChannel()
    expect(useFeedbackState.getState().draft).toBe('')
    useSession.setState({ roomId: 'a', mapCompatible: true }); world()
    compose(); resetWorld()
    expect(useFeedbackState.getState()).toMatchObject({ draft: '', ownerId: '' })
  })
  it('invalidates the form on a map mismatch and uses a new key when the user intentionally changes a failed draft', async () => {
    compose()
    vi.spyOn(feedbackService, 'submit').mockRejectedValue(new Error('오류'))
    await submitFeedback()
    const key = useFeedbackState.getState().operationId
    editFeedbackDraft(body + ' 새 의견')
    expect(useFeedbackState.getState().operationId).toBe('')
    await submitFeedback()
    expect(useFeedbackState.getState().operationId).not.toBe(key)
    world(2, near, 'different')
    expect(useFeedbackState.getState()).toMatchObject({ open: false, pending: false, draft: body + ' 새 의견' })
  })
})
