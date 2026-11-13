import { finaleImpactMs } from './gameOverFinale'

/**
 * Pigeon poop raid: a regular distraction that reuses the game-over finale's flight to the camera.
 * The audience pigeon flies the finale path, splats the lens at the same impact time, and the splat
 * then fades from fully opaque to clear over exactly two seconds.
 */
export const poopFadeMs = 2000
export const poopImpactMs = finaleImpactMs
export const poopDurationMs = poopImpactMs + poopFadeMs

/** The raider is one of the two middle pigeons on the wire, chosen by the event's seeded direction. */
export function poopPigeon(direction: -1 | 1) {
  return direction === 1 ? 2 : 1
}

/** Opacity of the lens splat: 0 before impact, 1 at impact, then a linear fade to 0 over `poopFadeMs`. */
export function poopSplatOpacity(elapsed: number) {
  if (elapsed < poopImpactMs || elapsed >= poopDurationMs) return 0
  return 1 - (elapsed - poopImpactMs) / poopFadeMs
}
