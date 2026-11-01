/** 붕어빵 가게 기준 게임기 위치. 화면·E2E가 함께 쓰는 순수 계산이다. */
export function rpsCabinetPlacement(cart: { x: number; z: number; width: number; depth: number; yaw?: number; scale?: number }) {
  const yaw = cart.yaw ?? 0, scale = cart.scale ?? 1
  const across = cart.width * scale / 2 + 1.5, forward = cart.depth * scale / 2 - .8
  const sin = Math.sin(yaw), cos = Math.cos(yaw)
  const cabinet = { x: cart.x + across * cos + forward * sin, z: cart.z - across * sin + forward * cos, yaw }
  /** 기계 정면에 선 플레이어 위치. */
  return { cabinet, front: { x: cabinet.x + 1.3 * sin, z: cabinet.z + 1.3 * cos } }
}
