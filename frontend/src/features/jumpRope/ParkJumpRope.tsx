import { lazy, Suspense, useEffect, useLayoutEffect, useRef } from 'react'
import { useSession } from '../../network/worldClient'
import { closeParkJumpRope, useParkJumpRope } from './parkEntry'

const JumpRope = lazy(() => import('../../jump-rope-preview/JumpRopePreview')
  .then(({ JumpRopePreview }) => ({ default: JumpRopePreview })))

export function ParkJumpRope() {
  const dialog = useRef<HTMLDialogElement>(null)
  const owner = useParkJumpRope(s => s.owner)
  const scope = useSession(s => s.status === 'connected' ? s.sessionId + ':' + s.roomId : '')
  const open = !!owner && owner === scope
  useLayoutEffect(() => {
    const panel = dialog.current
    if (!open || !panel) return
    panel.showModal()
    return () => { if (panel.open) panel.close() }
  }, [open])
  useEffect(() => {
    if (owner && owner !== scope) closeParkJumpRope()
  }, [owner, scope])
  useEffect(() => closeParkJumpRope, [])
  return open && <dialog ref={dialog} className="park-jump-rope" aria-label="비둘기 줄넘기"
    onCancel={event => { event.preventDefault(); closeParkJumpRope() }}>
    <Suspense fallback={<button type="button" onClick={closeParkJumpRope}>공원으로 돌아가기</button>}>
      <JumpRope onExit={closeParkJumpRope} />
    </Suspense>
  </dialog>
}
