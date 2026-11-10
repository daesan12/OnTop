import { useEffect } from 'react'
import { useSession } from '../../network/worldClient'
import { openArcade } from '../arcade/store'
import { SpeedMolePanel } from './SpeedMolePanel'
import { closeSpeedMole, useSpeedMole } from './store'

export function SpeedMoleHost() {
  const open = useSpeedMole(s => s.open)
  const session = useSession(s => s.sessionId)
  const room = useSession(s => s.roomId)
  // A park exit, account change or channel change must not leave movement owned by the trial.
  useEffect(() => () => closeSpeedMole(), [session, room])
  return open ? <SpeedMolePanel onClose={() => { closeSpeedMole(); openArcade() }} /> : null
}
