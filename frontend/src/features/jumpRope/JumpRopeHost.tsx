import { lazy, Suspense, useEffect } from 'react'
import { useSession } from '../../network/worldClient'
import { closeJumpRope, useJumpRope } from './store'

const JumpRopeDialog = lazy(() => import('./JumpRopeDialog'))

export function JumpRopeHost() {
  const open = useJumpRope(state => state.open)
  const owner = useSession(state => state.sessionId)
  const room = useSession(state => state.roomId)
  useEffect(() => () => closeJumpRope(), [owner, room])
  return open && owner ? <Suspense fallback={<p role="status">줄넘기를 불러오는 중입니다.</p>}><JumpRopeDialog owner={owner} /></Suspense> : null
}
