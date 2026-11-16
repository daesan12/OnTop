import { avatars, useSession } from '../../network/worldClient'
import { tableBusy, useGame } from '../../game/store'
import { parkRuntime } from '../../park/runtime/runtime'
import { clearRoamingInput, inputState, panelOwnsKeys } from '../../world/inputOwnership'
import { benchBusy } from '../interactions/benchState'
import { fitnessBusy } from '../fitness/state'
import { telescopeBusy } from '../telescopes/state'
import { GENERATED_PARK_ENABLED, RENEWAL_PARK_ENABLED } from '../../park/mapSelection'
import { canReachFortune } from './placement'
import { beginFortuneConnection, closeFortune, syncFortuneCooldown, useFortune } from './state'
import { fortuneReceiptKey } from './cooldown'

export function openFortune() {
  const s = useSession.getState(), a = avatars.get(s.sessionId)
  if (!(GENERATED_PARK_ENABLED || RENEWAL_PARK_ENABLED) || s.status !== 'connected' || !s.mapCompatible || !s.roomId || s.pending
    || !a?.connected || a.swimming || a.carry || s.tableId || a.seatIndex >= 0 || a.fitnessId || a.telescopeId
    || benchBusy(s.sessionId) || fitnessBusy(s.sessionId) || telescopeBusy(s.sessionId)
    || tableBusy() || useGame.getState().watchedGameId || useGame.getState().game || panelOwnsKeys()
    || !canReachFortune(a.current)) return false
  if (useFortune.getState().owner !== s.sessionId) beginFortuneConnection(s.sessionId)
  syncFortuneCooldown()
  parkRuntime.stopMovement()
  clearRoamingInput()
  inputState.fortuneOpen = true
  useFortune.setState({ open: true, error: '' })
  return true
}

/** A reconnect closes the popup but restores the same three-hour receipt. */
export function watchFortuneConnection() {
  const session = useSession.getState()
  if (session.status === 'connected') beginFortuneConnection(session.sessionId)
  const unwatch = useSession.subscribe((next, previous) => {
    if (next.status === 'connected' && (previous.status !== 'connected' || next.sessionId !== previous.sessionId))
      beginFortuneConnection(next.sessionId)
    else if (next.status !== 'connected' || next.roomId !== previous.roomId || !next.mapCompatible) closeFortune()
  })
  const changed = (event: StorageEvent) => {
    if (event.key === fortuneReceiptKey(useFortune.getState().owner)) syncFortuneCooldown()
  }
  if (typeof window !== 'undefined') window.addEventListener('storage', changed)
  return () => { unwatch(); if (typeof window !== 'undefined') window.removeEventListener('storage', changed) }
}
