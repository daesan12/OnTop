import { create } from 'zustand'
import { useSession } from '../../network/worldClient'
import { clearRoamingInput, inputState } from '../../world/inputOwnership'
import type { RoundEndReason } from '../../jump-rope-preview/jumpRopeRules'
import { refreshWalletAfterSettlement } from '../wallet/settlementRefresh'
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
  if (useJumpRope.getState().open) return
  clearRoamingInput()
  inputState.minigameOpen = true
  if (document.pointerLockElement) document.exitPointerLock()
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
    receipt = await jumpRopeService.complete(pending.id, pending.offsets)
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
  void settle({ ...submission, offsets: Object.freeze([...submission.offsets]) })
}

export function retryJumpRope() {
  const pending = useJumpRope.getState().settlement
  if (pending?.status === 'failed' && pending.retryable) {
    const { owner, id, expiresAt, reason, offsets } = pending
    void settle({ owner, id, expiresAt, reason, offsets })
  }
}
