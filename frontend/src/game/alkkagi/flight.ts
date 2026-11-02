import type { Piece } from './replay'

/** 탈락 이후의 시각 효과만 계산한다. 서버의 생존/충돌 결과에는 영향을 주지 않는다. */
export function exitFlight(piece: Piece, elapsed: number) {
  const exit = piece.exit ?? { x: piece.x, y: piece.y, vx: piece.vx, vy: piece.vy }
  const t = Math.max(0, Math.min(.9, elapsed))
  // 수평 속도 v(t)=v0*exp(-6t)의 적분. 프레임률에 관계없이 빠르게 감속한다.
  const travelTime = -Math.expm1(-6 * t) / 6
  return { x: exit.x + exit.vx * travelTime, z: exit.y + exit.vy * travelTime,
    height: .45 * t - 7 * t * t, opacity: Math.max(0, 1 - t / .9),
    spin: travelTime * (2 + Math.min(10, Math.hypot(exit.vx, exit.vy))), visible: elapsed < .9 }
}
