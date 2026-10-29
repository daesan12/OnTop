import { create } from 'zustand'
import type { AnonymousNote } from '../../park/mapConfig'
import { inputState } from '../../world/inputOwnership'
import { parseNoteText } from './validation'
import type { NoteTopic } from './topics'

const initial = () => ({ open: false, draft: '', draftTopic: 'free' as NoteTopic, submittedTopic: 'free' as NoteTopic,
  ownerId: '', channelId: '', notes: [] as AnonymousNote[], displayNotes: [] as AnonymousNote[],
  loaded: false, prefetched: false, loading: false, pending: false, error: '', readError: '', notice: '',
  operationId: '', submittedText: '', retryBlocked: false, nextAllowedAt: 0, nextReadAt: 0, epoch: 0 })
export const useNotesState = create(initial)
let lifetime = new AbortController()
export const notesSignal = () => lifetime.signal
export function resetNotesState(keepDraft = false) {
  lifetime.abort()
  lifetime = new AbortController()
  inputState.notesOpen = false
  useNotesState.setState(s => ({ ...initial(), epoch: s.epoch + 1, ...(keepDraft ? {
    draft: s.draft, ownerId: s.ownerId, channelId: s.channelId, operationId: s.operationId,
    submittedText: s.submittedText, retryBlocked: s.retryBlocked, nextAllowedAt: s.nextAllowedAt,
    draftTopic: s.draftTopic, submittedTopic: s.submittedTopic,
    displayNotes: s.displayNotes,
    error: s.pending ? '게시 결과를 확인하지 못했습니다. 다시 열어 목록을 확인한 뒤 같은 메모로 재시도해주세요.' : s.error,
  } : {}) }))
}
export function editNoteTopic(draftTopic: NoteTopic) {
  const s = useNotesState.getState()
  if (s.pending || s.draftTopic === draftTopic) return
  useNotesState.setState({ draftTopic, operationId: '', submittedText: '', retryBlocked: false, error: '' })
}
export function editNoteDraft(draft: string) {
  const state = useNotesState.getState()
  if (state.pending) return
  useNotesState.setState({ draft, error: '', notice: '',
    ...(state.submittedText !== parseNoteText(draft) ? { operationId: '', submittedText: '', retryBlocked: false } : {}) })
}
