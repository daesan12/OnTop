import { useSession } from '../../network/worldClient'
import { useGame } from '../../game/store'
import { useBungeoppang } from '../bungeoppang/store'
import { toggleMouseLook, useMouseLook } from '../../world/mouseLook'
import { useCameraPerspective } from '../../world/cameraPerspective'
import './camera.css'

export function CameraControls() {
  const active = useMouseLook(s => s.active), error = useMouseLook(s => s.error)
  const firstPerson = useCameraPerspective(s => s.perspective === 'first-person')
  const hidden = useSession(s => !!(s.tableId || s.benchId || s.fitnessId || s.telescopeId || s.watchedTableId))
  const disabled = useSession(s => s.status !== 'connected' || !s.mapCompatible || s.pending)
  const watching = useGame(s => !!s.watchedGameId)
  const cooking = useBungeoppang(s => s.phase !== 'idle')
  if (hidden || watching || cooking) return null
  return <aside className="park-camera-controls" aria-label="공원 카메라 조작">
    {error && <p className="park-camera-message" role="status">{error}</p>}
    <button type="button" className="park-quick-button" aria-label="1인칭 시점" aria-pressed={firstPerson}
      aria-keyshortcuts="V" disabled={disabled} title="산책 중 V로 1·3인칭 시점 전환"
      onClick={event => { event.currentTarget.blur(); window.dispatchEvent(new Event('ontop-toggle-camera-perspective')) }}>
      <span>{firstPerson ? '1인칭' : '3인칭'}</span><kbd>V</kbd>
    </button>
    <button type="button" className="park-quick-button" aria-label="마우스 룩" aria-pressed={active}
      aria-keyshortcuts="Control" disabled={disabled} title={active ? 'Ctrl 또는 Esc로 마우스 고정 해제' : 'Ctrl을 눌렀다 떼면 클릭 없이 시점 회전'}
      onClick={event => { event.currentTarget.blur(); toggleMouseLook() }}>
      <span>{active ? '마우스 룩 켜짐' : '마우스 룩'}</span><kbd>Ctrl</kbd>
    </button>
  </aside>
}
