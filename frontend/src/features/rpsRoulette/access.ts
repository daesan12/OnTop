import { MINI_PROPS } from '../../park/mapConfig'
import { avatars, useSession } from '../../network/worldClient'
import { tableBusy, useGame } from '../../game/store'
import { inputState, panelOwnsKeys } from '../../world/inputOwnership'
import { benchBusy } from '../interactions/benchState'
import { fitnessBusy } from '../fitness/state'
import { telescopeBusy } from '../telescopes/state'

/**
 * 붕어빵 가게 오른쪽 앞 잔디의 화면용 게임기. 공원 맵(server-map·mapVersion)은 바꾸지 않으므로 충돌과 시설 점유가 없다.
 * 위치는 담당자가 맵 변경과 함께 확정할 때까지 이 값만 옮기면 된다.
 */
const cart = MINI_PROPS[0]
const yaw = 'yaw' in cart ? cart.yaw : 0
const scale = 'scale' in cart ? cart.scale : 1
const across = cart.width * scale / 2 + 1.5, forward = cart.depth * scale / 2 - .8
const sin = Math.sin(yaw), cos = Math.cos(yaw)
export const RPS_CABINET = {
  x: cart.x + across * cos + forward * sin,
  z: cart.z - across * sin + forward * cos,
  yaw,
}
/** 기계 정면에 선 플레이어 위치. */
export const RPS_CABINET_FRONT = { x: RPS_CABINET.x + 1.3 * sin, z: RPS_CABINET.z + 1.3 * cos }

export function canReachRpsRoulette(p: { x: number; y: number; z: number }) {
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
