import { NOTES_BOX } from '../../config/notes'
import { tableBusy } from '../../game/store'
import { avatars, authoritativePose, useSession } from '../../network/worldClient'
import { parkRuntime } from '../../park/runtime/runtime'
import { clearRoamingInput, inputState, panelOwnsKeys } from '../../world/inputOwnership'
import { rememberRoamingView } from '../../world/cameraReturn'
import { useBenchState } from '../interactions/benchState'
import { useFitnessState } from '../fitness/state'
import { useTelescopeState } from '../telescopes/state'
import { NotesServiceError, type NotesContext } from './contracts'
import { notesService } from './service'
import { notesSignal, resetNotesState, useNotesState } from './state'
import { canReachNotes, compareNotes, NOTES_TIMEOUT_MS, parseNotes, parseNoteText } from './validation'

function context(): NotesContext | null {
  const s = useSession.getState(), a = avatars.get(s.sessionId), position = authoritativePose(s.sessionId)
  return s.status === 'connected' && s.mapCompatible && s.roomId && a?.connected && position
    && !s.pending && !s.tableId && a.seatIndex < 0 && !a.fitnessId && !a.telescopeId && !a.swimming
    && !useBenchState.getState().pending && !useFitnessState.getState().pending && !useTelescopeState.getState().pending
    && !tableBusy() && canReachNotes(position) ? { userId: s.sessionId, channelId: s.roomId, position: { ...position } } : null
}
export function openNotes(): boolean {
  const scope = context()
  if (!scope || panelOwnsKeys()) return false
  const state = useNotesState.getState()
  if (state.ownerId !== scope.userId || state.channelId !== scope.channelId) resetNotesState()
  rememberRoamingView(scope.userId, scope.channelId)
  parkRuntime.stopMovement()
  clearRoamingInput()
  inputState.notesOpen = true
  useNotesState.setState({ open: true, ownerId: scope.userId, channelId: scope.channelId, notice: '' })
  if (notesService.mode !== 'unavailable') void refreshNotes()
  return true
}
export function closeNotes() {
  resetNotesState(true)
  clearRoamingInput()
  if (typeof document !== 'undefined') document.querySelector<HTMLCanvasElement>('canvas')?.focus({ preventScroll: true })
}
async function request<T>(kind: 'read' | 'submit', job: (scope: NotesContext, signal: AbortSignal) => Promise<T>, accept: (result: T) => void) {
  const state = useNotesState.getState(), scope = context()
  if (!state.open || state.loading || state.pending || !scope || state.ownerId !== scope.userId || state.channelId !== scope.channelId
    || Object.entries(inputState).some(([key, value]) => key !== 'notesOpen' && value)) return false
  if (notesService.mode === 'unavailable') return false
  if (kind === 'read' && Date.now() < state.nextReadAt) return false
  useNotesState.setState(kind === 'read' ? { loading: true, readError: '', nextReadAt: Date.now() + 1000 } : { pending: true, error: '', notice: '' })
  const parent = notesSignal(), child = new AbortController()
  const cancel = () => child.abort()
  parent.addEventListener('abort', cancel, { once: true })
  let timeout = false, rejectAbort = () => {}
  const cancelled = new Promise<never>((_, reject) => { rejectAbort = () => reject(new Error('메모 요청이 취소되었습니다.')) })
  child.signal.addEventListener('abort', rejectAbort, { once: true })
  const timer = setTimeout(() => { timeout = true; child.abort() }, NOTES_TIMEOUT_MS)
  const current = () => useNotesState.getState().epoch === state.epoch && useNotesState.getState().open
    && useSession.getState().sessionId === scope.userId && useSession.getState().roomId === scope.channelId
  try {
    const result = await Promise.race([Promise.resolve().then(() => job(scope, child.signal)), cancelled])
    if (!current() || child.signal.aborted) return false
    if (!context()) throw new Error('위치나 연결 상태가 바뀌었습니다. 정상 메모함에서 다시 열어주세요.')
    accept(result)
    return true
  } catch (error) {
    if (current()) {
      const message = timeout ? kind === 'read' ? '메모 조회 응답 시간이 초과됐습니다. 다시 불러와주세요.'
        : '응답 시간이 초과되어 게시 여부를 확인하지 못했습니다. 목록을 확인한 뒤 같은 메모로 재시도해주세요.'
        : error instanceof Error ? error.message : '메모 요청에 실패했습니다.'
      const deadline = error instanceof NotesServiceError && error.nextAllowedAt !== undefined ? error.nextAllowedAt : 0
      useNotesState.setState(kind === 'read'
        ? { readError: message, nextReadAt: Math.max(useNotesState.getState().nextReadAt, deadline) }
        : { error: message, nextAllowedAt: Math.max(useNotesState.getState().nextAllowedAt, deadline),
          retryBlocked: error instanceof NotesServiceError && ['NOTE_REMOVED', 'NOTES_REQUEST_EXPIRED'].includes(error.code) })
    }
    return false
  } finally {
    clearTimeout(timer)
    parent.removeEventListener('abort', cancel)
    child.signal.removeEventListener('abort', rejectAbort)
    if (current()) useNotesState.setState(kind === 'read' ? { loading: false } : { pending: false })
  }
}
export const refreshNotes = () => request('read', (scope, signal) => notesService.read(scope, signal), result => {
  useNotesState.setState({ notes: parseNotes(result), loaded: true })
})
export async function submitNote() {
  const state = useNotesState.getState(), text = parseNoteText(state.draft)
  if (!state.open || state.pending || state.loading || state.retryBlocked || !context()) return false
  if (!text) { useNotesState.setState({ error: '메모를 1~300자로 적어주세요.' }); return false }
  if (Date.now() < state.nextAllowedAt) { useNotesState.setState({ error: '잠시 후 새 메모를 붙여주세요.' }); return false }
  const operationId = state.operationId && state.submittedText === text && state.submittedTopic === state.draftTopic ? state.operationId : Date.now() + '_' + crypto.randomUUID()
  useNotesState.setState({ operationId, submittedText: text, submittedTopic: state.draftTopic })
  return request('submit', (scope, signal) => notesService.submit(scope, { text, operationId, ...(notesService.supportsTopics ? { category: state.draftTopic } : {}) }, signal), receipt => {
    const [note] = parseNotes([receipt.note])
    if (!note || note.text !== text || (notesService.supportsTopics && note.category !== state.draftTopic) || !Number.isFinite(receipt.nextAllowedAt) || receipt.nextAllowedAt < note.createdAt)
      throw new Error('게시 결과를 확인하지 못했습니다. 목록을 확인한 뒤 다시 시도해주세요.')
    useNotesState.setState(s => ({ draft: '', operationId: '', submittedText: '', nextAllowedAt: receipt.nextAllowedAt,
      retryBlocked: false, notes: [note, ...s.notes.filter(n => n.id !== note.id)].sort(compareNotes).slice(0, NOTES_BOX.capacity),
      loaded: true, notice: notesService.mode === 'mock'
        ? '개발 목업에 메모를 붙였어요. 현재 페이지에서만 보이며 실제 서버에 저장되지 않습니다.' : '익명 메모를 붙였어요. 고맙습니다!' }))
  })
}
let stopWatcher: (() => void) | undefined
/** One coalesced refresh per creation event. An idle board never schedules a read. */
export function watchNotes() {
  stopWatcher?.()
  const signal = notesSignal()
  let stopped = false, dirty = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const flush = () => {
    if (stopped || signal.aborted || !dirty) return
    const s = useNotesState.getState()
    if (!s.open) return
    if (!context()) { resetNotesState(true); return }
    if (s.pending || s.loading) return
    clearTimeout(timer)
    const wait = Math.max(0, s.nextReadAt - Date.now())
    if (wait) { timer = setTimeout(flush, wait); return }
    dirty = false
    void refreshNotes()
  }
  const unsubscribe = notesService.subscribe(() => { dirty = true; flush() })
  const unwatch = useNotesState.subscribe((s, previous) => {
    if ((previous.loading && !s.loading) || (previous.pending && !s.pending)) flush()
  })
  const stop = () => {
    stopped = true; clearTimeout(timer); unsubscribe(); unwatch(); signal.removeEventListener('abort', stop)
    if (stopWatcher === stop) stopWatcher = undefined
  }
  stopWatcher = stop
  signal.addEventListener('abort', stop, { once: true })
  return stop
}
