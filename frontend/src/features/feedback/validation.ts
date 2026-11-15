import { MAILBOX, MAILBOX_BASE_Y } from '../../park/mapConfig'
import type { Pose } from '../../network/worldClient'

export const FEEDBACK_TIMEOUT_MS = 10_000
export function parseFeedbackText(value: string): string | null {
  if (value.length > 600) return null
  const text = value.normalize('NFC').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\p{Cf}]/gu, '').trim()
  return text.length >= 5 && text.length <= 600 ? text : null
}
export function canReachFeedback(position: Pose | undefined) {
  return !!position && [position.x, position.y, position.z].every(Number.isFinite)
    && Math.hypot(position.x - MAILBOX.x, position.z - MAILBOX.z) <= MAILBOX.interactionRadius
    && Math.abs(position.y - MAILBOX_BASE_Y - 0.8) <= 0.7
}
