import type { Piece } from './replay'

/** 탈락 이후의 시각 효과만 계산한다. 서버의 생존/충돌 결과에는 영향을 주지 않는다. */
export function exitFlight(piece: Piece, elapsed: number) {
  const exit = piece.exit ?? { x: piece.x, y: piece.y, vx: piece.vx, vy: piece.vy }
  const t = Math.max(0, Math.min(.9, elapsed))
  return { x: exit.x + exit.vx * t, z: exit.y + exit.vy * t,
    height: .45 * t - 7 * t * t, opacity: Math.max(0, 1 - t / .9),
    spin: t * (2 + Math.min(10, Math.hypot(exit.vx, exit.vy))), visible: elapsed < .9 }
}
