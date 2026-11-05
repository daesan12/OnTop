import { MINI_PROPS } from '../../park/mapConfig'
import { PARK_LAYOUT } from '../../map/park'
import { GENERATED_PARK_ENABLED } from '../../park/mapSelection'
import { parkRuntime } from '../../park/runtime/runtime'
import { avatars, useSession } from '../../network/worldClient'
import { tableBusy, useGame } from '../../game/store'
import { clearRoamingInput, inputState, panelOwnsKeys } from '../../world/inputOwnership'
import { LocalVrAdmission } from './admission'
import { ServerVrAdmission } from './serverAdmission'
import { refreshWalletAfterSettlement } from '../wallet/settlementRefresh'
import { VrZoneController } from './controller'
import { canReachVrEntrance, vrEntrance } from './anchors'

const hall = MINI_PROPS[1]
export const parkVrEntrance = vrEntrance(hall, GENERATED_PARK_ENABLED ? PARK_LAYOUT.VR_YAW : 0)
export const canReachParkVr = (position: { x: number; y: number; z: number }) => canReachVrEntrance(position, parkVrEntrance)
// Explicit local preview only. A server error never falls back to test money.
const local = import.meta.env.DEV && import.meta.env.VITE_VR_ZONE_PREVIEW === 'true'
export const parkVrZone = new VrZoneController(local ? new LocalVrAdmission() : new ServerVrAdmission(
  parkRuntime.requestJSON, {
    owner: () => useSession.getState().sessionId,
    storage: () => sessionStorage,
    paid: (owner, receipt) => refreshWalletAfterSettlement(owner, `skewer:${receipt}`),
  },
), true)
export function openParkVrZone() {
  const session = useSession.getState(), avatar = avatars.get(session.sessionId)
  if (panelOwnsKeys() || session.status !== 'connected' || !session.mapCompatible || session.pending || session.tableId || !avatar
    || avatar.swimming || avatar.seatIndex >= 0 || avatar.benchId || avatar.fitnessId || avatar.telescopeId
    || useGame.getState().game || useGame.getState().watchedGameId || tableBusy() || !canReachParkVr(avatar.current)) return false
  clearRoamingInput()
  inputState.minigameOpen = true
  if (document.pointerLockElement) document.exitPointerLock()
  if (import.meta.env.VITE_SKEWER_COOP_ENABLED === 'true') parkVrZone.openFree()
  else void parkVrZone.open()
  return true
}
