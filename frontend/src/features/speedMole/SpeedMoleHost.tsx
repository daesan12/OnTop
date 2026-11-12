import { lazy, Suspense, useEffect } from 'react'
import { useSession } from '../../network/worldClient'
import { openArcade, useArcade } from '../arcade/store'
import { closeSpeedMole, useSpeedMole } from './store'

const SpeedMolePanel = lazy(() => import('./SpeedMolePanel').then(module => ({ default: module.SpeedMolePanel })))

export function SpeedMoleHost() {
  const open = useSpeedMole(s => s.open)
  const session = useSession(s => s.sessionId)
  const room = useSession(s => s.roomId)
  // A park exit, account change or channel change must release the game's movement ownership.
  useEffect(() => () => closeSpeedMole(), [session, room])
  return open ? <Suspense fallback={<p role="status">스피드 두더지를 불러오는 중입니다.</p>}><SpeedMolePanel onClose={() => { closeSpeedMole(); openArcade(useArcade.getState().scope) }} /></Suspense> : null
}
