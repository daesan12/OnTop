import { lazy, Suspense, useEffect, useRef } from 'react'
import { useSession } from '../../network/worldClient'
import { RENEWAL_PARK_ENABLED } from '../../park/mapSelection'
import { focusParkCanvas, inputState } from '../../world/inputOwnership'
import { openArcade } from '../arcade/store'
import { jumpRopeService } from './service'
import { closeJumpRope, retryJumpRope, submitJumpRope, useJumpRope } from './store'
import './jump-rope-world.css'

const JumpRopePanel = lazy(() => import('../../jump-rope-preview/JumpRopePreview').then(module => ({ default: module.JumpRopePreview })))
const setActive = (active: boolean) => useJumpRope.setState({ active })
const canJump = () => !inputState.manualOpen

export function JumpRopeHost() {
  const open = useJumpRope(state => state.open)
  const owner = useSession(state => state.sessionId)
  const room = useSession(state => state.roomId)
  useEffect(() => () => closeJumpRope(), [owner, room])
  return open && owner ? <JumpRopeDialog owner={owner} /> : null
}

function JumpRopeDialog({ owner }: { owner: string }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const settlement = useJumpRope(state => state.settlement?.owner === owner ? state.settlement : null)
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])

  function close(toArcade = false) {
    dialog.current?.close()
    closeJumpRope()
    if (toArcade) openArcade()
    else focusParkCanvas()
  }

  return <dialog ref={dialog} className="jump-rope-world" aria-label="구구구 줄넘기"
    onCancel={event => { event.preventDefault(); close() }}>
    <Suspense fallback={<p role="status">줄넘기를 불러오는 중입니다.</p>}>
      <JumpRopePanel ranked={{ owner, service: jumpRopeService, settlement, setActive, submit: submitJumpRope, retry: retryJumpRope, onExit: () => close(), canJump }} />
    </Suspense>
    <button type="button" className="jump-rope-world__exit" onClick={() => close(!RENEWAL_PARK_ENABLED)}>
      {RENEWAL_PARK_ENABLED ? '공원으로 돌아가기' : '게임 선택으로'}
    </button>
  </dialog>
}
