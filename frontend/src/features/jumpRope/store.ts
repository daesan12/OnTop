import { create } from 'zustand'
import { useSession } from '../../network/worldClient'
import { rememberRoamingView } from '../../world/cameraReturn'
import { clearRoamingInput, inputState } from '../../world/inputOwnership'
import { useMouseLook } from '../../world/mouseLook'
import type { RoundEndReason } from '../../jump-rope-preview/jumpRopeRules'
import { JumpRopeApiError, jumpRopeService, type JumpRopeReceipt } from './service'

type Submission = { owner: string; id: string; expiresAt: number; reason: RoundEndReason; offsets: readonly number[] }
export type JumpRopeSettlement = Submission & (
  | { status: 'saving' }
  | { status: 'saved'; receipt: JumpRopeReceipt }
  | { status: 'failed'; message: string; retryable: boolean }
)

export const useJumpRope = create<{ open: boolean; active: boolean; settlement: JumpRopeSettlement | null }>(
  () => ({ open: false, active: false, settlement: null }),
)

export function openJumpRope() {
  const { sessionId, roomId } = useSession.getState()
  if (!sessionId || !roomId || inputState.minigameOpen || useJumpRope.getState().open) return
  if (useMouseLook.getState().active) rememberRoamingView(sessionId, roomId)
  inputState.minigameOpen = true
  clearRoamingInput()
  useJumpRope.setState({ open: true })
}

export function closeJumpRope() {
  if (!useJumpRope.getState().open) return
  useJumpRope.setState({ open: false, active: false })
  inputState.minigameOpen = false
  clearRoamingInput()
}

async function settle(submission: Submission) {
  if (useSession.getState().sessionId !== submission.owner) return
  if (performance.now() > submission.expiresAt) {
    const error = new JumpRopeApiError('JUMP_ROPE_ROUND_EXPIRED', false)
    useJumpRope.setState({ settlement: { ...submission, status: 'failed', message: error.message, retryable: false }, active: false })
    return
  }
  const pending: JumpRopeSettlement = { ...submission, status: 'saving' }
  useJumpRope.setState({ settlement: pending, active: false })
  try {
    const receipt = await jumpRopeService.complete(pending.id, pending.offsets)
    if (useJumpRope.getState().settlement === pending) useJumpRope.setState({ settlement: { ...submission, status: 'saved', receipt } })
  } catch (error) {
    if (useJumpRope.getState().settlement !== pending) return
    const failure = error instanceof JumpRopeApiError ? error : new JumpRopeApiError('', true)
    useJumpRope.setState({ settlement: { ...submission, status: 'failed', message: failure.message, retryable: failure.retryable } })
  }
}

export const jumpRopeSettlementActive = (state: ReturnType<typeof useJumpRope.getState>) =>
  state.settlement?.status === 'saving' && state.settlement.owner === useSession.getState().sessionId

export function submitJumpRope(submission: Submission) {
  const previous = useJumpRope.getState().settlement
  if (previous?.owner === submission.owner && previous.id === submission.id) return
  void settle({ ...submission, offsets: Object.freeze([...submission.offsets]) })
}

export function retryJumpRope() {
  const pending = useJumpRope.getState().settlement
  if (pending?.status === 'failed' && pending.retryable) {
    const { owner, id, expiresAt, reason, offsets } = pending
    void settle({ owner, id, expiresAt, reason, offsets })
  }
}
