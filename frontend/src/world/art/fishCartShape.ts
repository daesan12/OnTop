import { Shape } from 'three'

/** The same curved fish outline for the cart moulds, batter and cooked bread. */
export function createFishCartShape(scale = 1) {
  const s = new Shape()
  s.moveTo(-0.12 * scale, 0.025 * scale)
  s.lineTo(-0.21 * scale, 0.085 * scale); s.lineTo(-0.19 * scale, 0)
  s.lineTo(-0.21 * scale, -0.085 * scale); s.lineTo(-0.12 * scale, -0.025 * scale)
  s.bezierCurveTo(-0.07 * scale, -0.10 * scale, 0.11 * scale, -0.10 * scale, 0.17 * scale, -0.025 * scale)
  s.quadraticCurveTo(0.21 * scale, 0, 0.17 * scale, 0.025 * scale)
  s.bezierCurveTo(0.11 * scale, 0.10 * scale, -0.07 * scale, 0.10 * scale, -0.12 * scale, 0.025 * scale)
  s.closePath()
  return s
}
