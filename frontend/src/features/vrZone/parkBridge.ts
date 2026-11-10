import { MINI_PROPS } from '../../park/mapConfig'
import { PARK_LAYOUT } from '../../map/park'
import { GENERATED_PARK_ENABLED } from '../../park/mapSelection'
import {renewalAnchor} from '../../park-renewal/runtime/placements'
import { avatars, useSession } from '../../network/worldClient'
import { tableBusy, useGame } from '../../game/store'
import { clearRoamingInput, inputState, panelOwnsKeys } from '../../world/inputOwnership'
import { UnavailableVrAdmission } from './admission'
import { VrZoneController } from './controller'
import { canReachVrEntrance, vrEntrance } from './anchors'

const hall = MINI_PROPS[1]
const mapped=renewalAnchor('game-entry','vr-experience-hall')
export const parkVrEntrance = mapped?{...mapped.reach!,radius:mapped.radius??2.8}:vrEntrance(hall, GENERATED_PARK_ENABLED ? PARK_LAYOUT.VR_YAW : 0)
export const canReachParkVr = (position: { x: number; y: number; z: number }) => canReachVrEntrance(position, parkVrEntrance)
// The park entry is exclusively free co-op. Legacy paid solo previews stay isolated.
// Keep paid authorization disabled even if a caller invokes the old controller methods.
export const parkVrZone = new VrZoneController(new UnavailableVrAdmission(async () => 0), true)
export function openParkVrZone() {
  const session = useSession.getState(), avatar = avatars.get(session.sessionId)
  if (panelOwnsKeys() || session.status !== 'connected' || !session.mapCompatible || session.pending || session.tableId || !avatar
    || avatar.swimming || avatar.seatIndex >= 0 || avatar.benchId || avatar.fitnessId || avatar.telescopeId
    || useGame.getState().game || useGame.getState().watchedGameId || tableBusy() || !canReachParkVr(avatar.current)) return false
  clearRoamingInput()
  inputState.minigameOpen = true
  if (document.pointerLockElement) document.exitPointerLock()
  parkVrZone.openFree()
  return true
}
