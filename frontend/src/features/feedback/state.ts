import { create } from 'zustand'
import { inputState } from '../../world/inputOwnership'
import { parseFeedbackText } from './validation'

const initial = () => ({ open: false, draft: '', ownerId: '', channelId: '', pending: false,
  error: '', notice: '', operationId: '', submittedText: '', nextAllowedAt: 0, epoch: 0 })
export const useFeedbackState = create(initial)
let lifetime = new AbortController()
export const feedbackSignal = () => lifetime.signal
/** A reconnect/closed dialog keeps only this user's in-memory draft and retry key. Logout clears all. */
export function resetFeedbackState(keepDraft = false) {
  lifetime.abort()
  lifetime = new AbortController()
  inputState.feedbackOpen = false
  useFeedbackState.setState(s => ({ ...initial(), epoch: s.epoch + 1, ...(keepDraft ? {
    draft: s.draft, ownerId: s.ownerId, channelId: s.channelId, operationId: s.operationId,
    submittedText: s.submittedText, nextAllowedAt: s.nextAllowedAt,
    error: s.pending ? '전달 결과를 확인하지 못했습니다. 소리함에서 같은 내용으로 다시 시도할 수 있어요.' : s.error,
  } : {}) }))
}
export function editFeedbackDraft(draft: string) {
  const state = useFeedbackState.getState()
  if (state.pending) return
  useFeedbackState.setState({ draft, error: '', notice: '',
    ...(state.submittedText !== parseFeedbackText(draft) ? { operationId: '', submittedText: '' } : {}) })
}
