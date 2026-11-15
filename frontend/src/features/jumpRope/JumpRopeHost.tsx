import { lazy, Suspense, useEffect, useState } from 'react'
import { useSession } from '../../network/worldClient'
import { getPreparedJumpRopeDialog, loadJumpRopeDialog } from './loadJumpRopeView'
import { closeJumpRope, useJumpRope } from './store'

const LazyJumpRopeDialog = lazy(loadJumpRopeDialog)

function OpenJumpRopeDialog({ owner }: { owner: string }) {
  // A preloaded component can render without suspending on its first mount.
  const [Dialog] = useState(() => getPreparedJumpRopeDialog() ?? LazyJumpRopeDialog)
  return <Suspense fallback={<p role="status">줄넘기를 불러오는 중입니다.</p>}><Dialog owner={owner} /></Suspense>
}

export function JumpRopeHost() {
  const open = useJumpRope(state => state.open)
  const owner = useSession(state => state.sessionId)
  const room = useSession(state => state.roomId)
  useEffect(() => () => closeJumpRope(), [owner, room])
  return open && owner ? <OpenJumpRopeDialog owner={owner} /> : null
}
