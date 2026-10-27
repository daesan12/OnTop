import { tableBusy } from '../../game/store'
import { avatars, authoritativePose, useSession } from '../../network/worldClient'
import { parkRuntime } from '../../park/runtime/runtime'
import { clearRoamingInput, inputState, panelOwnsKeys } from '../../world/inputOwnership'
import { rememberRoamingView } from '../../world/cameraReturn'
import { useBenchState } from '../interactions/benchState'
import { useFitnessState } from '../fitness/state'
import { useTelescopeState } from '../telescopes/state'
import { feedbackService } from './service'
import { FeedbackServiceError } from './contracts'
import { feedbackSignal, resetFeedbackState, useFeedbackState } from './state'
import { canReachFeedback, FEEDBACK_TIMEOUT_MS, parseFeedbackText } from './validation'

function eligible() {
  const s = useSession.getState(), a = avatars.get(s.sessionId)
  return s.status === 'connected' && s.mapCompatible && !!s.roomId && a?.connected
    && !s.pending && !s.tableId && a.seatIndex < 0 && !a.fitnessId && !a.telescopeId && !a.swimming
    && !useBenchState.getState().pending && !useFitnessState.getState().pending && !useTelescopeState.getState().pending
    && !tableBusy() && canReachFeedback(authoritativePose(s.sessionId))
}
export function openFeedback(): boolean {
  if (!eligible() || panelOwnsKeys()) return false
  const session = useSession.getState(), state = useFeedbackState.getState()
  if (state.ownerId !== session.sessionId || state.channelId !== session.roomId) resetFeedbackState()
  rememberRoamingView(session.sessionId, session.roomId)
  parkRuntime.stopMovement()
  clearRoamingInput()
  inputState.feedbackOpen = true
  useFeedbackState.setState({ open: true, ownerId: session.sessionId, channelId: session.roomId, notice: '' })
  return true
}
export function closeFeedback() {
  resetFeedbackState(true)
  clearRoamingInput()
  if (typeof document !== 'undefined') document.querySelector<HTMLCanvasElement>('canvas')?.focus({ preventScroll: true })
}
export async function submitFeedback(): Promise<boolean> {
  const state = useFeedbackState.getState(), session = useSession.getState(), text = parseFeedbackText(state.draft)
  if (!state.open || state.pending || state.ownerId !== session.sessionId || state.channelId !== session.roomId) return false
  if (!text) { useFeedbackState.setState({ error: '내용을 5~600자로 작성해주세요.' }); return false }
  if (!eligible() || Object.entries(inputState).some(([key, value]) => key !== 'feedbackOpen' && value)) {
    useFeedbackState.setState({ error: '열린 창과 연결 상태를 확인하고 소리함 가까이에서 다시 시도해주세요.' }); return false
  }
  if (feedbackService.mode === 'unavailable') { useFeedbackState.setState({ error: '소리함 서버 연결이 아직 준비되지 않았습니다.' }); return false }
  if (Date.now() < state.nextAllowedAt) { useFeedbackState.setState({ error: '잠시 후 다시 의견을 보내주세요.' }); return false }
  const operationId = state.operationId && state.submittedText === text ? state.operationId : crypto.randomUUID()
  useFeedbackState.setState({ pending: true, error: '', notice: '', operationId, submittedText: text })
  const parent = feedbackSignal(), request = new AbortController()
  const current = () => useFeedbackState.getState().epoch === state.epoch && useFeedbackState.getState().open
    && useSession.getState().sessionId === session.sessionId && useSession.getState().roomId === session.roomId
  const cancel = () => request.abort()
  parent.addEventListener('abort', cancel, { once: true })
  let timedOut = false, rejectAbort: () => void = () => {}
  const cancelled = new Promise<never>((_, reject) => { rejectAbort = () => reject(new Error('의견 전달이 취소되었습니다.')) })
  request.signal.addEventListener('abort', rejectAbort, { once: true })
  const timer = setTimeout(() => { timedOut = true; request.abort() }, FEEDBACK_TIMEOUT_MS)
  try {
    const receipt = await Promise.race([Promise.resolve().then(() => feedbackService.submit({ operationId,
      userId: session.sessionId, channelId: session.roomId, position: authoritativePose(session.sessionId)!, text }, request.signal)), cancelled])
    if (!current() || request.signal.aborted) return false
    if (!eligible()) throw new Error('위치나 연결 상태가 바뀌었습니다. 소리함 가까이에서 같은 내용으로 다시 시도해주세요.')
    if (!receipt.receiptId || !Number.isFinite(receipt.acceptedAt) || !Number.isFinite(receipt.nextAllowedAt) || receipt.nextAllowedAt < receipt.acceptedAt)
      throw new Error('전달 결과를 확인하지 못했습니다. 같은 내용으로 다시 시도해주세요.')
    useFeedbackState.setState({ draft: '', operationId: '', submittedText: '', error: '',
      nextAllowedAt: receipt.nextAllowedAt,
      notice: feedbackService.mode === 'mock' ? '목업 전달을 확인했어요. 실제 관리자에게 전송하거나 영구 저장하지 않습니다.' : '의견을 전달했어요. 고맙습니다!' })
    return true
  } catch (error) {
    if (current()) useFeedbackState.setState({
      ...(error instanceof FeedbackServiceError && error.nextAllowedAt !== undefined
        ? { nextAllowedAt: Math.max(useFeedbackState.getState().nextAllowedAt, error.nextAllowedAt) } : {}),
      error: timedOut
      ? '응답 시간이 초과되어 전달 결과를 확인하지 못했습니다. 원문은 보관했으며 같은 내용으로 다시 시도할 수 있어요.'
      : error instanceof Error ? error.message : '의견을 전달하지 못했습니다. 다시 시도해주세요.' })
    return false
  } finally {
    clearTimeout(timer)
    parent.removeEventListener('abort', cancel)
    request.signal.removeEventListener('abort', rejectAbort)
    if (current()) useFeedbackState.setState({ pending: false })
  }
}
