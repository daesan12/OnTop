import { FeedbackServiceError, type FeedbackService } from './contracts'
import { MockFeedbackService } from './mock/MockFeedbackService'
import { parkRuntime } from '../../park/runtime/runtime'
import { RestError } from '../../network/restError'
import { record } from '../../network/protocol'
import { parseFeedbackText } from './validation'

const messages: Record<string, string> = {
  FEEDBACK_TEXT_INVALID: '내용을 5~600자로 작성해주세요.',
  INVALID_REQUEST: '전달할 내용을 확인해주세요. 같은 문제가 계속되면 새로고침 후 다시 시도해주세요.',
  FEEDBACK_OUT_OF_RANGE: '지상 소리함 가까이에서 같은 의견으로 다시 시도해주세요.',
  NOT_IN_CHANNEL: '공원 연결을 확인하고 같은 의견으로 다시 시도해주세요.',
  FEEDBACK_ACTIVITY_CONFLICT: '시설·수영·게임 이용을 마친 뒤 다시 시도해주세요.',
  IDEMPOTENCY_CONFLICT: '같은 요청으로 다른 내용을 보낼 수 없습니다. 내용을 수정해 새 의견으로 보내주세요.',
  FEEDBACK_COOLDOWN: '잠시 후 다시 의견을 보내주세요.',
  FEEDBACK_NOT_CONFIGURED: '소리함 서버 설정이 아직 준비되지 않았습니다. 작성 내용은 보관됩니다.',
  FEEDBACK_UNAVAILABLE: '소리함 서버가 의견을 저장하지 못했습니다. 같은 의견으로 다시 시도해주세요.',
}
const instant = (value: unknown) => typeof value === 'string' ? Date.parse(value) : NaN

/** Existing authenticated REST only; no public broadcast, administrator reads or failure-to-mock fallback. */
export function createFeedbackService(requestJSON: (path: string, init?: RequestInit) => Promise<unknown>): FeedbackService {
  return {
    mode: 'server',
    async submit(submission, signal) {
      const text = parseFeedbackText(submission.text)
      if (!text || !/^[A-Za-z0-9_-]{1,64}$/.test(submission.operationId) || !submission.channelId)
        throw new FeedbackServiceError('INVALID_REQUEST', messages.INVALID_REQUEST!)
      if (signal.aborted) throw new Error('의견 전달이 취소되었습니다.')
      try {
        const value = await requestJSON('/api/v1/feedback', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
          body: JSON.stringify({ operationId: submission.operationId, channelId: submission.channelId, text }),
        })
        if (signal.aborted) throw new Error('의견 전달이 취소되었습니다.')
        const acceptedAt = record(value) ? instant(value.acceptedAt) : NaN
        const nextAllowedAt = record(value) ? instant(value.nextAllowedAt) : NaN
        if (!record(value) || typeof value.receiptId !== 'string' || !/^[1-9]\d*$/.test(value.receiptId)
          || !Number.isFinite(acceptedAt) || !Number.isFinite(nextAllowedAt) || nextAllowedAt < acceptedAt)
          throw new FeedbackServiceError('INVALID_RESPONSE', '전달 결과를 확인하지 못했습니다. 같은 의견으로 다시 시도해주세요.')
        return { receiptId: value.receiptId, acceptedAt, nextAllowedAt }
      } catch (error) {
        if (error instanceof FeedbackServiceError || signal.aborted) throw error
        if (error instanceof RestError) {
          const nextAllowedAt = instant(error.nextAllowedAt)
          throw new FeedbackServiceError(error.code, messages[error.code]
            ?? (error.status === 404 ? messages.FEEDBACK_NOT_CONFIGURED! : error.message),
            error.code === 'FEEDBACK_COOLDOWN' && Number.isFinite(nextAllowedAt) ? nextAllowedAt : undefined)
        }
        throw new FeedbackServiceError('NETWORK_ERROR', '전달 결과를 확인하지 못했습니다. 원문은 보관했으며 같은 의견으로 다시 시도할 수 있어요.')
      }
    },
  }
}

export const feedbackService: FeedbackService = import.meta.env.DEV && ['facility-preview', 'feedback-preview'].includes(import.meta.env.MODE)
  ? new MockFeedbackService() : createFeedbackService((path, init) => parkRuntime.requestJSON(path, init))
