/** Client-only dimensions; these never change scoring, randomness or turn timing. */
export const FARKLE_VISUAL = {
  tabletopScale: 0.7,
  tabletopOffsetX: 0.2,
  dieScale: 0.85,
  traySurfaceY: 1.098,
  cupRestX: 0.91,
  cupRestY: 1.065,
  cupRestZ: 0.4,
  cupLift: 0.24,
  cupBounds: { minX: -0.7, maxX: 0.91, minZ: -0.48, maxZ: 0.48 },
} as const;

export const DIE_REST_Y =
  FARKLE_VISUAL.traySurfaceY + 0.075 * FARKLE_VISUAL.dieScale;
