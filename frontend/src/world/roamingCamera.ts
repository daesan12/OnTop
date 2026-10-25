import { avatars, useSession } from '../network/worldClient'
import { tableBusy, useGame } from '../game/store'
import { useBenchState } from '../features/interactions/benchState'
import { useFitnessState } from '../features/fitness/state'
import { useTelescopeState } from '../features/telescopes/state'
import { facilityMovementBlocked } from '../features/facilities/state'
import { panelOwnsKeys, textInputOwnsKeys } from './inputOwnership'
import { useCameraPerspective } from './cameraPerspective'

export function canControlRoamingCamera() {
  const s = useSession.getState(), avatar = avatars.get(s.sessionId)
  return s.status === 'connected' && s.mapCompatible && !!avatar?.connected && !s.pending
    && !s.tableId && !s.benchId && !s.fitnessId && !s.telescopeId && !useGame.getState().watchedGameId
    && !useBenchState.getState().pending && !useFitnessState.getState().pending && !useTelescopeState.getState().pending
    && !facilityMovementBlocked(s.sessionId) && !tableBusy() && !document.hidden
    && !panelOwnsKeys() && !textInputOwnsKeys(document.activeElement)
}

/** A modal pauses controls without changing the chosen view. Facilities own their cameras. */
export function roamingFirstPerson(avatar: { tableId: string; benchId: string; fitnessId: string; telescopeId: string }, watching: boolean) {
  return !watching && !avatar.tableId && !avatar.benchId && !avatar.fitnessId && !avatar.telescopeId
    && useCameraPerspective.getState().perspective === 'first-person'
}
