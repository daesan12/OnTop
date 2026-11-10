import { MAILBOX } from '../../park/mapConfig'
import type { Pose } from '../../network/worldClient'
import {RENEWAL_PARK_ENABLED} from '../../park/mapSelection'
import {renewalInReach} from '../../park-renewal/runtime/placements'

export const FEEDBACK_TIMEOUT_MS = 10_000
export function parseFeedbackText(value: string): string | null {
  if (value.length > 600) return null
  const text = value.normalize('NFC').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\p{Cf}]/gu, '').trim()
  return text.length >= 5 && text.length <= 600 ? text : null
}
export function canReachFeedback(position: Pose | undefined) {
  if(RENEWAL_PARK_ENABLED)return renewalInReach('interaction','feedback-mailbox',position)
  return !!position && [position.x, position.y, position.z].every(Number.isFinite)
    && Math.hypot(position.x - MAILBOX.x, position.z - MAILBOX.z) <= MAILBOX.interactionRadius
    && Math.abs(position.y - 0.8) <= 0.7
}
