import { lazy, Suspense, useEffect, useRef } from 'react'
import { useSession } from '../../network/worldClient'
import { RENEWAL_PARK_ENABLED } from '../../park/mapSelection'
import { restoreRoamingView } from '../../world/cameraReturn'
import { focusParkCanvas, inputState, panelOwnsKeys } from '../../world/inputOwnership'
import { mouseLookReturn, toggleMouseLook } from '../../world/mouseLook'
import { canControlRoamingCamera } from '../../world/roamingCamera'
import { openArcade } from '../arcade/store'
import { jumpRopeService } from './service'
import { closeJumpRope, retryJumpRope, submitJumpRope, useJumpRope } from './store'
import './jump-rope-world.css'

const JumpRopePanel = lazy(() => import('../../jump-rope-preview/JumpRopePreview').then(module => ({ default: module.JumpRopePreview })))
const setActive = (active: boolean) => useJumpRope.setState({ active })
const canJump = () => !inputState.manualOpen

export default function JumpRopeDialog({ owner }: { owner: string }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const exitRequest = useRef<(() => boolean) | null>(null)
  const settlement = useJumpRope(state => state.settlement?.owner === owner ? state.settlement : null)
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])

  function close(toArcade = false) {
    dialog.current?.close()
    closeJumpRope()
    if (toArcade) { openArcade(); return }
    queueMicrotask(() => {
      focusParkCanvas()
      const { sessionId, roomId, status } = useSession.getState()
      restoreRoamingView(sessionId, roomId, status !== 'connected' || panelOwnsKeys())
      // Resume during the exit gesture, even if the parked canvas needs a slow first frame.
      if (mouseLookReturn.requested && !document.pointerLockElement && canControlRoamingCamera()) toggleMouseLook()
    })
  }

  function requestExit() {
    if (!exitRequest.current?.()) close()
  }

  return <dialog ref={dialog} className="jump-rope-world" aria-label="구구구 줄넘기"
    onCancel={event => { event.preventDefault(); requestExit() }}
    onKeyDown={event => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.nativeEvent.isComposing) return
      event.preventDefault()
      event.stopPropagation()
      if (!event.repeat) requestExit()
    }}>
    <Suspense fallback={<p role="status">줄넘기를 불러오는 중입니다.</p>}>
      <JumpRopePanel ranked={{ owner, service: jumpRopeService, settlement, setActive, submit: submitJumpRope, retry: retryJumpRope, onExit: () => close(), canJump, exitRequest }} />
    </Suspense>
    <button type="button" className="jump-rope-world__exit" onClick={() => close(!RENEWAL_PARK_ENABLED)}>
      {RENEWAL_PARK_ENABLED ? '공원으로 돌아가기' : '게임 선택으로'}
    </button>
  </dialog>
}
