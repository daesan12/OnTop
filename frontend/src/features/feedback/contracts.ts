import type { Pose } from '../../network/worldClient'

/** Internal FE port. Request ID, receipt and cooldown must be mapped to an approved BE contract. */
export interface FeedbackSubmission {
  operationId: string
  userId: string
  channelId: string
  position: Pose
  text: string
}
export interface FeedbackReceipt { receiptId: string; acceptedAt: number; nextAllowedAt: number }
export interface FeedbackService {
  readonly mode: 'mock' | 'unavailable'
  submit(submission: FeedbackSubmission, signal: AbortSignal): Promise<FeedbackReceipt>
}
