/** Table/board visual dimensions only. Rules and seat assignment belong to the server. */
export const GOMOKU = {
  interactionRadius: 3.5,
  boardSpan: 1.3,
  // The board's lowest bevel is 48mm below this anchor; clear the 1.064m felt.
  boardY: 1.12,
  seatedFov: 76,
  topDownFov: 42,
  boardOuterSpan: 1.48,
  topDownScreenFill: 0.8,
  // Seat selection is explicit: south = black, north = white.
  seatZ: [1.25, -1.25] as const,
} as const
