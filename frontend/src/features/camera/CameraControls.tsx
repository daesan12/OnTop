import { useSession } from '../../network/worldClient'
import { useGame } from '../../game/store'
import { useBungeoppang } from '../bungeoppang/store'
import { useMouseLook } from '../../world/mouseLook'
import './camera.css'

/** The HUD has no camera buttons; V (1·3인칭) and a Ctrl tap (마우스 룩) stay, and pointer-lock notices still show here. */
export function CameraControls() {
  const error = useMouseLook(s => s.error)
  const hidden = useSession(s => !!(s.tableId || s.benchId || s.fitnessId || s.telescopeId || s.watchedTableId))
  const watching = useGame(s => !!s.watchedGameId)
  const cooking = useBungeoppang(s => s.phase !== 'idle')
  if (hidden || watching || cooking || !error) return null
  return <aside className="park-camera-controls" aria-label="공원 카메라 안내">
    <p className="park-camera-message" role="status">{error}</p>
  </aside>
}
