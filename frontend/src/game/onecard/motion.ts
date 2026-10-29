/** Presentation thresholds only; the existing server still decides whether a card is legal. */
export const CARD_DRAG_SLOP = 7
export function cardDropReady(dx: number, dy: number, height: number) {
  return -dy >= Math.max(64, Math.min(104, height * .42))
    && Math.abs(dx) <= Math.max(110, height * .9)
}

export interface Spring { position: number; velocity: number }
/** Bounded substeps keep the damped spring stable after a slow frame or tab switch. */
export function stepSpring(spring: Spring, target: number, delta: number) {
  let remaining = Math.min(.064, Math.max(0, delta))
  while (remaining > 0) {
    const dt = Math.min(remaining, 1 / 120)
    spring.velocity += ((target - spring.position) * 210 - spring.velocity * 24) * dt
    spring.position += spring.velocity * dt
    remaining -= dt
  }
  if (Math.abs(target - spring.position) < .0001 && Math.abs(spring.velocity) < .0001) {
    spring.position = target; spring.velocity = 0
  }
  return spring.position
}
