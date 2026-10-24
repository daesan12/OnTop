import { MINI_PROPS } from '../../config'
import { avatars, useSession } from '../../network/worldClient'
import { tableBusy, useGame } from '../../game/store'
import { inputState } from '../../world/inputOwnership'
import { benchBusy } from '../interactions/benchState'
import { fitnessBusy } from '../fitness/state'
import { telescopeBusy } from '../telescopes/state'

export function canReachBungeoppang(p: { x: number; y: number; z: number }) {
  const cart = MINI_PROPS[0]
  return Math.hypot(p.x - cart.x, p.z - cart.z) <= 4.2 && Math.abs(p.y - .8) <= .9
}
export function canOpenBungeoppang(): boolean {
  const s = useSession.getState(), avatar = avatars.get(s.sessionId)
  return s.status === 'connected' && s.mapCompatible && !s.pending && !!s.roomId && !!avatar
    && !s.tableId && !tableBusy() && !useGame.getState().watchedGameId && !useGame.getState().game
    && !benchBusy(s.sessionId) && !fitnessBusy(s.sessionId) && !telescopeBusy(s.sessionId)
    && !Object.values(inputState).some(Boolean) && !avatar.swimming && canReachBungeoppang(avatar.current)
}
