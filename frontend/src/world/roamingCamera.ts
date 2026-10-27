import { avatars, useSession } from '../network/worldClient'
import { tableBusy, useGame } from '../game/store'
import { useBenchState } from '../features/interactions/benchState'
import { useFitnessState } from '../features/fitness/state'
import { useTelescopeState } from '../features/telescopes/state'
import { facilityMovementBlocked, useFacilityState } from '../features/facilities/state'
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

export type LookOwner = 'park' | 'bench' | 'telescope' | 'fitness' | 'hold'

/**
 * Who may own pointer lock right now. Benches, telescopes and fitness stations keep mouse look
 * because they can be left with the keyboard (S15P31B105-217); 'hold' covers their enter/leave
 * request so the lock survives the round trip without turning. Tables, watched games, minigames
 * and any panel or text input need the cursor or a fixed view, so they still release it.
 */
export function lookOwner(): LookOwner | null {
  if (canControlRoamingCamera()) return 'park'
  const s = useSession.getState(), avatar = avatars.get(s.sessionId), bench = useBenchState.getState()
  if (s.status !== 'connected' || !s.mapCompatible || !avatar?.connected || s.pending
    || s.tableId || tableBusy() || document.hidden
    || panelOwnsKeys() || textInputOwnsKeys(document.activeElement)) return null
  const fitness = useFitnessState.getState(), telescope = useTelescopeState.getState()
  const facilities = useFacilityState.getState()
  // Leaving waits for the server's exit position; keep the lock without turning until it lands.
  if (bench.pending || fitness.pending || telescope.pending || facilities.pending || facilities.awaitingWorld) return 'hold'
  // Placements land with the server response, a moment before the session fields.
  if (s.telescopeId || telescope.placements[s.sessionId]) return 'telescope'
  if (s.fitnessId || fitness.placements[s.sessionId]) return 'fitness'
  return s.benchId || bench.placements[s.sessionId] ? 'bench' : null
}

/** A modal pauses controls without changing the chosen view. Facilities own their cameras. */
export function roamingFirstPerson(avatar: { tableId: string; benchId: string; fitnessId: string; telescopeId: string }, watching: boolean) {
  return !watching && !avatar.tableId && !avatar.benchId && !avatar.fitnessId && !avatar.telescopeId
    && useCameraPerspective.getState().perspective === 'first-person'
}
