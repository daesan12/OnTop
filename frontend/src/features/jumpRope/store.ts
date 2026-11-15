import { create } from 'zustand'
import { useSession } from '../../network/worldClient'
import { rememberRoamingView } from '../../world/cameraReturn'
import { clearRoamingInput, inputState } from '../../world/inputOwnership'
import { useMouseLook } from '../../world/mouseLook'
import type { RoundEndReason } from '../../jump-rope-preview/jumpRopeRules'
import { refreshWalletAfterSettlement } from '../wallet/settlementRefresh'
import { JumpRopeApiError, jumpRopeService, type JumpRopeDuckSpan, type JumpRopeReceipt } from './service'

/** duckSpans is present exactly for a rules v2 round, and a retry resends the same frozen logs. */
type Submission = {
  owner: string; id: string; expiresAt: number; reason: RoundEndReason; offsets: readonly number[]
  duckSpans?: readonly JumpRopeDuckSpan[]
}
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
  let receipt: JumpRopeReceipt
  try {
    // A v1 round keeps the original call; only a v2 round passes its duck log.
    receipt = await (pending.duckSpans
      ? jumpRopeService.complete(pending.id, pending.offsets, pending.duckSpans)
      : jumpRopeService.complete(pending.id, pending.offsets))
  } catch (error) {
    if (useJumpRope.getState().settlement !== pending) return
    const failure = error instanceof JumpRopeApiError ? error : new JumpRopeApiError('', true)
    useJumpRope.setState({ settlement: { ...submission, status: 'failed', message: failure.message, retryable: failure.retryable } })
    return
  }
  if (useJumpRope.getState().settlement === pending) {
    useJumpRope.setState({ settlement: { ...submission, status: 'saved', receipt } })
  }
  if (receipt.reward !== null && receipt.reward > 0 && useSession.getState().sessionId === submission.owner) {
    refreshWalletAfterSettlement(submission.owner, `jump-rope:reward:${receipt.id}`)
  }
}

export const jumpRopeSettlementActive = (state: ReturnType<typeof useJumpRope.getState>) =>
  state.settlement?.status === 'saving' && state.settlement.owner === useSession.getState().sessionId

export function submitJumpRope(submission: Submission) {
  const previous = useJumpRope.getState().settlement
  if (previous?.owner === submission.owner && previous.id === submission.id) return
  const { duckSpans, ...rest } = submission
  void settle({
    ...rest, offsets: Object.freeze([...submission.offsets]),
    ...(duckSpans ? { duckSpans: Object.freeze(duckSpans.map(([start, end]) => Object.freeze([start, end] as const))) } : {}),
  })
}

export function retryJumpRope() {
  const pending = useJumpRope.getState().settlement
  if (pending?.status === 'failed' && pending.retryable) {
    const { owner, id, expiresAt, reason, offsets, duckSpans } = pending
    void settle({ owner, id, expiresAt, reason, offsets, ...(duckSpans ? { duckSpans } : {}) })
  }
}
