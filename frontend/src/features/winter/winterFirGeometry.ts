import { BufferGeometry, Float32BufferAttribute } from 'three'

type Point = [number, number, number]
const lobe = (angle: number) => (.5 + .5 * Math.cos(angle * 6))
const outerRadius = (angle: number) => .82 + .18 * lobe(angle)
const edgeY = (angle: number) => -.60 - .15 * lobe(angle)
function surfaceY(t: number, angle: number) {
  if (t <= .4) return 1 + (.28 - 1) * t / .4
  if (t <= .7) return .28 + (-.16 - .28) * (t - .4) / .3
  return -.16 + (edgeY(angle) + .16) * (t - .7) / .3
}

/** Six lobed boughs per existing tier, within the original cone's radius and height. */
function tier(snow: 'light' | 'heavy' | null) {
  const sides = snow ? 24 : 12
  const vertices: number[] = []
  const triangle = (a: Point, b: Point, c: Point) => vertices.push(...a, ...b, ...c)
  const snowyEdge = (angle: number) => snow === 'heavy' ? .93 + .035 * lobe(angle) : .75 + .08 * lobe(angle)
  const point = (ring: number, i: number, underside = false): Point => {
    const a = i * Math.PI * 2 / sides, edge = snow ? snowyEdge(a) : 1
    const t = ring * edge, r = outerRadius(a) * t
    const thickness = snow === 'heavy' ? .14 : .085
    const y = surfaceY(t, a) + (snow ? underside ? .008 : thickness * (.5 + .5 * (1 - ring) ** 2) : underside ? -.12 : 0)
    return [Math.sin(a) * r, y, Math.cos(a) * r]
  }
  const rings = snow ? [.4, .75, 1] : [.4, .7, 1]
  for (let i = 0; i < sides; i++) {
    const next = (i + 1) % sides
    triangle([0, 1 + (snow ? .04 : 0), 0], point(rings[0]!, i), point(rings[0]!, next))
    for (let ring = 0; ring < rings.length - 1; ring++) {
      const a = point(rings[ring]!, i), b = point(rings[ring]!, next)
      const c = point(rings[ring + 1]!, i), d = point(rings[ring + 1]!, next)
      triangle(a, c, b); triangle(b, c, d)
    }
    const a = point(1, i), b = point(1, next), c = point(1, i, true), d = point(1, next, true)
    triangle(a, c, b); triangle(b, c, d)
    if (!snow) triangle([0, -.8, 0], d, c)
  }
  const geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(vertices, 3))
  geometry.computeVertexNormals(); geometry.computeBoundingSphere(); return geometry
}

// Shared by every winter fir instance; no per-tree mesh construction or animation.
export const winterFirFoliage = tier(null)
export const winterFirLightSnow = tier('light')
export const winterFirHeavySnow = tier('heavy')
