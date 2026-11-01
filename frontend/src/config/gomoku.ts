/** Table/board visual dimensions only. Rules and seat assignment belong to the server. */
export const GOMOKU = {
  interactionRadius: 3.5,
  boardSpan: 1.3,
  // 두꺼운 판의 최하단(-114mm)이 1.064m 테이블 상판을 침범하지 않는다.
  boardY: 1.18,
  seatedFov: 76,
  topDownFov: 42,
  boardOuterSpan: 1.48,
  topDownScreenFill: 0.8,
  // Seat selection is explicit: south = black, north = white.
  seatZ: [1.25, -1.25] as const,
} as const
