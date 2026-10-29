import type { Pose } from '../../network/worldClient'

/** Internal FE context. Only operationId/channelId/text belong in the REST payload. */
export interface FeedbackSubmission {
  operationId: string
  userId: string
  channelId: string
  position: Pose
  text: string
}
export interface FeedbackReceipt { receiptId: string; acceptedAt: number; nextAllowedAt: number }
export class FeedbackServiceError extends Error {
  constructor(readonly code: string, message: string, readonly nextAllowedAt?: number) { super(message) }
}
export interface FeedbackService {
  readonly mode: 'mock' | 'server' | 'unavailable'
  submit(submission: FeedbackSubmission, signal: AbortSignal): Promise<FeedbackReceipt>
}
