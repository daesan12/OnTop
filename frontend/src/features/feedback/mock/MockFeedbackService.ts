import type { FeedbackReceipt, FeedbackService, FeedbackSubmission } from '../contracts'
import { canReachFeedback, parseFeedbackText } from '../validation'

/** M07_FEEDBACK_MOCK_ONLY: private per-page receipts, no public list, body persistence or administrator API. */
export class MockFeedbackService implements FeedbackService {
  readonly mode = 'mock' as const
  #receipts = new Map<string, { digest: string; receipt: FeedbackReceipt }>()
  #nextAllowed = new Map<string, number>()
  constructor(private readonly delayMs = 240) {}
  async submit(submission: FeedbackSubmission, signal: AbortSignal): Promise<FeedbackReceipt> {
    await new Promise<void>((resolve, reject) => {
      if (signal.aborted) { reject(new Error('소리함 목업 요청이 취소되었습니다.')); return }
      const abort = () => { clearTimeout(timer); reject(new Error('소리함 목업 요청이 취소되었습니다.')) }
      const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, this.delayMs)
      signal.addEventListener('abort', abort, { once: true })
    })
    const text = parseFeedbackText(submission.text)
    if (!text || !submission.userId || !submission.channelId || !submission.operationId) throw new Error('내용을 5~600자로 작성해주세요.')
    if (!canReachFeedback(submission.position)) throw new Error('지상 소리함 가까이에서 의견을 남겨주세요.')
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
    if (signal.aborted) throw new Error('소리함 목업 요청이 취소되었습니다.')
    const digest = [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('')
    const key = JSON.stringify([submission.userId, submission.operationId]), existing = this.#receipts.get(key)
    if (existing) {
      if (existing.digest !== digest) throw new Error('같은 요청으로 다른 내용을 보낼 수 없습니다.')
      return { ...existing.receipt }
    }
    const now = Date.now()
    if (now < (this.#nextAllowed.get(submission.userId) ?? 0)) throw new Error('잠시 후 다시 의견을 보내주세요.')
    const receipt = { receiptId: crypto.randomUUID(), acceptedAt: now, nextAllowedAt: now + 15_000 }
    this.#receipts.set(key, { digest, receipt })
    this.#nextAllowed.set(submission.userId, receipt.nextAllowedAt)
    return { ...receipt }
  }
}
