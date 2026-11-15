import { createStore } from 'zustand/vanilla'
import { MINI_PROPS } from '../../park/mapConfig'
import { PARK_LAYOUT } from '../../map/park'
import { GENERATED_PARK_ENABLED } from '../../park/mapSelection'
import { renewalMap } from '../../park/renewalMap'
import { avatars, useSession } from '../../network/worldClient'
import { tableBusy, useGame } from '../../game/store'
import { clearRoamingInput, inputState, panelOwnsKeys } from '../../world/inputOwnership'
import { rememberRoamingView } from '../../world/cameraReturn'
import { useMouseLook } from '../../world/mouseLook'
import { canReachVrEntrance, vrEntrance } from './anchors'

const hall = MINI_PROPS[1]
export const parkVrEntrance = renewalMap?.data.interactions.vrEntrance
  ?? vrEntrance(hall, GENERATED_PARK_ENABLED ? PARK_LAYOUT.VR_YAW : 0)
export const canReachParkVr = (position: { x: number; y: number; z: number }) => canReachVrEntrance(position, parkVrEntrance)
const store = createStore<{ phase: 'closed' | 'catalog' }>(() => ({ phase: 'closed' }))
const close = () => store.setState({ phase: 'closed' })
export const parkVrZone = { store, close, endVisit: close }
export function openParkVrZone() {
  const session = useSession.getState(), avatar = avatars.get(session.sessionId)
  if (panelOwnsKeys() || session.status !== 'connected' || !session.mapCompatible || session.pending || session.tableId || !avatar
    || avatar.swimming || avatar.seatIndex >= 0 || avatar.benchId || avatar.fitnessId || avatar.telescopeId
    || useGame.getState().game || useGame.getState().watchedGameId || tableBusy() || !canReachParkVr(avatar.current)) return false
  if (useMouseLook.getState().active) rememberRoamingView(session.sessionId, session.roomId)
  inputState.minigameOpen = true
  clearRoamingInput()
  store.setState({ phase: 'catalog' })
  return true
}
