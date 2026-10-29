import { WORLD } from '../../config'
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  Matrix4,
  CircleGeometry,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

export const WALL = {
  module: 4,
  depth: WORLD.boundaryHalfDepth * 2,
  bodyTop: 1.69,
  base: 0.24,
  eave: 0.76,
  tilePitch: 0.25,
  nearDistance: 46,
} as const

/** A shallow concave sweep: the drip edge lifts again, as in the supplied photo. */
export function wallRoofHeight(z: number) {
  const t = Math.min(1, Math.abs(z) / WALL.eave)
  return 2.07 - 0.38 * Math.sin((t * Math.PI) / 2) + 0.09 * t ** 6
}
type Point = [number, number, number]
const palette = ['#484d50', '#53585b', '#42484b', '#5b5e60', '#4c5255']

function tint(g: BufferGeometry, color: string) {
  const c = new Color(color),
    colors: number[] = []
  for (let i = 0; i < g.getAttribute('position').count; i++)
    colors.push(c.r, c.g, c.b)
  g.setAttribute('color', new Float32BufferAttribute(colors, 3))
  return g
}
function patch(
  uSteps: number,
  vSteps: number,
  point: (u: number, v: number) => Point,
  color: string,
  reverse = false,
) {
  const pos: number[] = [],
    uv: number[] = [],
    indices: number[] = []
  for (let v = 0; v <= vSteps; v++)
    for (let u = 0; u <= uSteps; u++) {
      pos.push(...point(u / uSteps, v / vSteps))
      uv.push(u / uSteps, v / vSteps)
    }
  for (let v = 0; v < vSteps; v++)
    for (let u = 0; u < uSteps; u++) {
      const a = v * (uSteps + 1) + u,
        b = a + 1,
        c = a + uSteps + 1,
        d = c + 1
      indices.push(...(reverse ? [a, c, b, b, c, d] : [a, b, c, b, d, c]))
    }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2))
  g.setIndex(indices)
  g.computeVertexNormals()
  return tint(g, color)
}
function box(
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  c: string,
) {
  return tint(new BoxGeometry(w, h, d).translate(x, y, z), c)
}
function merge(parts: BufferGeometry[]) {
  const g = mergeGeometries(parts)
  parts.forEach((p) => p.dispose())
  g.computeBoundingBox()
  g.computeBoundingSphere()
  return g
}

/** Four-metre reusable roof. Both sides have pan tiles, barrel covers and lapped courses. */
export function createWallRoof(detailed = true) {
  const clay: BufferGeometry[] = [],
    ends: BufferGeometry[] = [],
    timber: BufferGeometry[] = []
  // Dark undersides keep gaps naturally shaded without hundreds of shadow casters.
  timber.push(box(4, 0.13, 1.21, 0, 1.68, 0, '#372f2b'))
  clay.push(
    box(4, 0.08, 0.28, 0, 2.04, 0, '#555a5c'),
    box(4, 0.045, 0.23, 0, 2.105, 0, '#696d6c'),
  )
  // Continuous dark tile bedding closes the small side gaps under convex covers.
  // It also closes the end channels where identical modules meet.
  for (const side of [-1, 1])
    clay.push(
      patch(
        1,
        12,
        (u, v) => [
          u * 4 - 2,
          wallRoofHeight(v * 0.76) - (detailed ? 0.04 : 0),
          side * v * 0.76,
        ],
        '#41484b',
        side === 1,
      ),
    )
  if (!detailed) {
    clay.push(
      tint(
        new CylinderGeometry(0.09, 0.09, 4, 8, 1, false, 0, Math.PI)
          .rotateZ(Math.PI / 2)
          .translate(0, 2.14, 0),
        '#51585a',
      ),
    )
    return { clay: merge(clay), timber: merge(timber), ends: null }
  }
  // The raised ridge is also tiled; shallow collars reveal joints at grazing angles.
  for (let i = 0; i < 10; i++) {
    clay.push(
      tint(
        new CylinderGeometry(0.096, 0.089, 0.406, 10, 1)
          .rotateZ(Math.PI / 2)
          .translate(-1.8 + i * 0.4, 2.14, 0),
        palette[i % 5]!,
      ),
    )
  }
  for (const side of [-1, 1])
    for (let col = 0; col < 16; col++) {
      const x = -2 + (col + 0.5) * WALL.tilePitch
      for (let course = 0; course < 3; course++) {
        const start = 0.07 + course * 0.225,
          end = start + 0.24
        const c = palette[(col * 3 + course + (side > 0 ? 1 : 0)) % 5]!
        // Convex cover, with an actual narrow lip at the lower end of each course.
        clay.push(
          patch(
            8,
            3,
            (u, v) => {
              const z = start + (end - start) * v,
                r = 0.076 + v * 0.009
              return [
                x - Math.cos(u * Math.PI) * r,
                wallRoofHeight(z) + Math.sin(u * Math.PI) * r + 0.009,
                side * z,
              ]
            },
            c,
            side === 1,
          ),
        )
        clay.push(
          patch(
            8,
            1,
            (u, v) => {
              const r = 0.085 - v * 0.012
              return [
                x - Math.cos(u * Math.PI) * r,
                wallRoofHeight(end) + Math.sin(u * Math.PI) * r + 0.009,
                side * end,
              ]
            },
            '#343b3f',
            side !== 1,
          ),
        )
        // Concave pan spans the channel between neighbouring cover tiles.
        if (col < 15)
          clay.push(
            patch(
              4,
              3,
              (u, v) => {
                const z = start + (end - start) * v
                return [
                  x + 0.075 + u * 0.1,
                  wallRoofHeight(z) - 0.035 * Math.sin(u * Math.PI),
                  side * z,
                ]
              },
              palette[(col + course + 2) % 5]!,
              side === 1,
            ),
          )
      }
      // Off-white round maksae, ring and rosette supplied by the material UVs.
      ends.push(
        tint(
          new CircleGeometry(0.078, 16)
            .rotateY(side < 0 ? Math.PI : 0)
            .translate(x, wallRoofHeight(0.76) + 0.012, side * 0.767),
          col % 3 ? '#c5c4b9' : '#d6d3c6',
        ),
      )
      if (col % 2 === 0) {
        timber.push(
          tint(
            new CylinderGeometry(0.057, 0.061, 1.4, 8)
              .rotateX(Math.PI / 2)
              .translate(x, 1.59, 0),
            col % 4 ? '#493a31' : '#594034',
          ),
        )
      }
    }
  return { clay: merge(clay), timber: merge(timber), ends: merge(ends) }
}

/** Raised hipped caps join the four wall runs; no intersecting roof strips at corners. */
export function createWallCorner() {
  const clay: BufferGeometry[] = [],
    ends: BufferGeometry[] = []
  for (let side = 0; side < 4; side++) {
    const yaw = (side * Math.PI) / 2,
      matrix = new Matrix4().makeRotationY(yaw)
    const point = (u: number, t: number): Point => [
      (u * 2 - 1) * (0.12 + t * 0.71),
      2.43 - 0.47 * Math.sin((t * Math.PI) / 2) + 0.1 * t ** 6,
      0.12 + t * 0.71,
    ]
    clay.push(patch(8, 6, point, '#454e51', true).applyMatrix4(matrix))
    for (let col = 0; col <= 8; col++) {
      const u = col / 8
      clay.push(
        patch(
          6,
          6,
          (a, t) => {
            const p = point(u, 0.13 + 0.87 * t),
              r = 0.055 * (0.35 + 0.65 * t)
            p[0] -= Math.cos(a * Math.PI) * r
            p[1] += Math.sin(a * Math.PI) * r + 0.01
            return p
          },
          palette[col % 5]!,
          true,
        ).applyMatrix4(matrix),
      )
      const p = point(u, 1)
      p[1] += 0.008
      p[2] += 0.008
      ends.push(
        tint(
          new CircleGeometry(0.059, 12).translate(...p),
          '#c7c6ba',
        ).applyMatrix4(matrix),
      )
    }
  }
  clay.push(box(0.34, 0.1, 0.34, 0, 2.46, 0, '#535b5c'))
  return { clay: merge(clay), ends: merge(ends) }
}
