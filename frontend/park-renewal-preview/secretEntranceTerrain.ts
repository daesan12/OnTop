import type { BufferGeometry } from 'three'
import { HORROR_PORTALS } from './horrorPlan'

type Vertex = [number, number, number]

/** Replace the coarse cliff cells with the visible soil on either side of the doorway. */
export function secretEntranceTerrain(ground: readonly BufferGeometry[]) {
  const vertices: number[] = [], indices: number[] = []
  const clip = (polygon: Vertex[], axis: 0 | 2, boundary: number, sign: number) => {
    const output: Vertex[] = []
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i]!, b = polygon[(i + 1) % polygon.length]!
      const da = (a[axis] - boundary) * sign, db = (b[axis] - boundary) * sign
      if (da >= 0) output.push(a)
      if ((da >= 0) !== (db >= 0)) {
        const t = da / (da - db)
        output.push(a.map((v, n) => v + (b[n]! - v) * t) as Vertex)
      }
    }
    return output
  }
  for (const portal of HORROR_PORTALS) {
    const x0 = Math.min(portal.x, portal.x + portal.outward)
    const x1 = Math.max(portal.x, portal.x + portal.outward)
    const z0 = Math.floor(portal.z - portal.width / 2), z1 = Math.ceil(portal.z + portal.width / 2)
    for (const geometry of ground) {
      const p = geometry.getAttribute('position'), ix = geometry.getIndex()!
      for (let i = 0; i < ix.count; i += 3) {
        let polygon = [0, 1, 2].map(n => {
          const id = ix.getX(i + n)
          return [p.getX(id), p.getY(id), p.getZ(id)] as Vertex
        })
        if (polygon.every(v => v[0] <= x0) || polygon.every(v => v[0] >= x1)
          || polygon.every(v => v[2] <= z0) || polygon.every(v => v[2] >= z1)) continue
        for (const [axis, boundary, sign] of [[0, x0, 1], [0, x1, -1], [2, z0, 1], [2, z1, -1]] as const) {
          polygon = clip(polygon, axis, boundary, sign)
        }
        for (let n = 1; n + 1 < polygon.length; n++) {
          const a = polygon[0]!, b = polygon[n]!, c = polygon[n + 1]!
          const up = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2])
          if (Math.abs(up) < 1e-10) continue
          const id = vertices.length / 3
          vertices.push(...a, ...b, ...c)
          indices.push(id, id + (up > 0 ? 1 : 2), id + (up > 0 ? 2 : 1))
        }
      }
    }
  }
  return { id: 'secret-entrance-terrain-support', role: 'surface' as const, vertices, indices }
}
