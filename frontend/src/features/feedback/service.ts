import type { FeedbackService } from './contracts'
import { MockFeedbackService } from './mock/MockFeedbackService'

export const feedbackService: FeedbackService = import.meta.env.DEV && import.meta.env.MODE === 'facility-preview'
  ? new MockFeedbackService() : { mode: 'unavailable', submit: async () => { throw new Error('소리함 서버 연결이 아직 준비되지 않았습니다.') } }
