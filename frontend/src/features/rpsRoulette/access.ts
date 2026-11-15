import { MINI_PROPS } from '../../park/mapConfig'
import { rpsCabinetPlacement } from './placement'
import { avatars, useSession } from '../../network/worldClient'
import { tableBusy, useGame } from '../../game/store'
import { inputState, panelOwnsKeys } from '../../world/inputOwnership'
import { benchBusy } from '../interactions/benchState'
import { fitnessBusy } from '../fitness/state'
import { telescopeBusy } from '../telescopes/state'
import { canReachRenewalRecreation, renewalMap } from '../../park/renewalMap'

/**
 * 붕어빵 가게 오른쪽 앞 잔디의 화면용 게임기. 공원 맵(server-map·mapVersion)은 바꾸지 않으므로 충돌과 시설 점유가 없다.
 * 위치는 담당자가 맵 변경과 함께 확정할 때까지 이 값만 옮기면 된다.
 */
const placement = rpsCabinetPlacement(MINI_PROPS[0])
export const RPS_CABINET = placement.cabinet
export const RPS_CABINET_FRONT = placement.front

export function canReachRpsRoulette(p: { x: number; y: number; z: number }) {
  if (renewalMap) {
    const machine = renewalMap.data.interactions.recreation?.find(anchor => anchor.id === 'rps-roulette-cabinet')
    return !!machine && canReachRenewalRecreation(p, machine)
  }
  return [p.x, p.y, p.z].every(Number.isFinite)
    && Math.hypot(p.x - RPS_CABINET_FRONT.x, p.z - RPS_CABINET_FRONT.z) <= 1.7 && Math.abs(p.y - .8) <= .9
}

export function canOpenRpsRoulette(): boolean {
  const s = useSession.getState(), avatar = avatars.get(s.sessionId)
  return s.status === 'connected' && s.mapCompatible && !s.pending && !!s.roomId && !!avatar
    && !s.tableId && !tableBusy() && !useGame.getState().watchedGameId && !useGame.getState().game
    && !benchBusy(s.sessionId) && !fitnessBusy(s.sessionId) && !telescopeBusy(s.sessionId)
    && !panelOwnsKeys() && !Object.values(inputState).some(Boolean) && !avatar.swimming && canReachRpsRoulette(avatar.current)
}
