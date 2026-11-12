import { MINI_PROPS } from '../../park/mapConfig'
import { GENERATED_PARK_ENABLED } from '../../park/mapSelection'
import { canReachRenewalRecreation, renewalMap } from '../../park/renewalMap'
import { avatars, useSession } from '../../network/worldClient'
import { tableBusy, useGame } from '../../game/store'
import { inputState } from '../../world/inputOwnership'
import { benchBusy } from '../interactions/benchState'
import { fitnessBusy } from '../fitness/state'
import { telescopeBusy } from '../telescopes/state'

export function canReachBungeoppang(p: { x: number; y: number; z: number }) {
  if (renewalMap) {
    const shop = renewalMap.data.interactions.recreation?.find(anchor => anchor.id === 'fish-bread')
    return !!shop && canReachRenewalRecreation(p, shop)
  }
  const cart = MINI_PROPS[0]
  if(![p.x,p.y,p.z].every(Number.isFinite))return false
  if(GENERATED_PARK_ENABLED){
    const yaw='yaw' in cart?cart.yaw:0,c=Math.cos(yaw),s=Math.sin(yaw),dx=p.x-cart.x,dz=p.z-cart.z
    const across=dx*c-dz*s,forward=dx*s+dz*c
    return Math.abs(across)<=cart.width/2+.8&&forward>=cart.depth/2+.25&&forward<=cart.depth/2+2.8&&Math.abs(p.y-.8)<=.9
  }
  return Math.hypot(p.x - cart.x, p.z - cart.z) <= 4.2 && Math.abs(p.y - .8) <= .9
}
export function canOpenBungeoppang(): boolean {
  const s = useSession.getState(), avatar = avatars.get(s.sessionId)
  return s.status === 'connected' && s.mapCompatible && !s.pending && !!s.roomId && !!avatar
    && !s.tableId && !tableBusy() && !useGame.getState().watchedGameId && !useGame.getState().game
    && !benchBusy(s.sessionId) && !fitnessBusy(s.sessionId) && !telescopeBusy(s.sessionId)
    && !Object.values(inputState).some(Boolean) && !avatar.swimming && canReachBungeoppang(avatar.current)
}
