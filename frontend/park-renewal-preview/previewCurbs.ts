import { createCurbGeometry, curbPaths } from './curbGeometry'
import { groundSurfaceHeight } from './groundSurface'
import { FLOOR_Y_OFFSET } from './groundPlan'
import { lakeWalkHeight } from './plan'
import { staticPark } from './static/store'

type Point3 = readonly [number, number, number]

function softenCurb(path: readonly Point3[]): Point3[] {
  const first = path[0]!
  const last = path.at(-1)!
  const closed = Math.hypot(first[0] - last[0], first[2] - last[2]) < 0.001
  const points = closed ? path.slice(0, -1) : path
  if (points.length < 3) return [...path]

  const count = points.length
  const distance = (a: Point3, b: Point3) => Math.hypot(a[0] - b[0], a[2] - b[2])
  const offsets = [0]
  for (let index = 1; index < count; index++) {
    offsets.push(offsets[index - 1]! + distance(points[index - 1]!, points[index]!))
  }
  const total = offsets.at(-1)! + (closed ? distance(points.at(-1)!, points[0]!) : 0)
  if (total < 1.2) return [...path]

  function at(offset: number): Point3 {
    const value = closed ? (offset + total) % total : Math.min(total, Math.max(0, offset))
    let low = 0
    let high = count - 1
    while (low < high) {
      const middle = Math.ceil((low + high) / 2)
      if (offsets[middle]! <= value) low = middle
      else high = middle - 1
    }
    const a = points[low]!
    const b = points[low + 1] ?? (closed ? points[0]! : a)
    const end = offsets[low + 1] ?? total
    const weight = end > offsets[low]! ? (value - offsets[low]!) / (end - offsets[low]!) : 0
    return [
      a[0] + (b[0] - a[0]) * weight,
      a[1] + (b[1] - a[1]) * weight,
      a[2] + (b[2] - a[2]) * weight,
    ]
  }

  const result = points.map((point, index): Point3 => {
    const offset = offsets[index]!
    const reach = closed ? 0.7 : Math.min(0.7, offset, total - offset)
    if (reach < 0.03) return point
    const previous = at(offset - reach)
    const next = at(offset + reach)
    const dx = ((previous[0] + next[0]) * 0.5 - point[0]) * 0.65
    const dz = ((previous[2] + next[2]) * 0.5 - point[2]) * 0.65
    const dy = ((previous[1] + next[1]) * 0.5 - point[1]) * 0.65
    const scale = Math.min(1, 0.15 / (Math.hypot(dx, dz) || 1))
    return [point[0] + dx * scale, point[1] + Math.max(-0.025, Math.min(0.025, dy)), point[2] + dz * scale]
  })
  if (closed) result.push(result[0]!)
  return result
}

// Smooth sub-metre zigzags along the verge. A low stone trim keeps the road
// silhouette readable without a raised rim casting a jagged line in plan view.
export const previewCurbs = createCurbGeometry(curbPaths.map(path => {
  // Saved curb heights predate the grading. Fit the affected points to the
  // same triangles as the rendered walkway before smoothing the corners.
  const aligned = staticPark ? path.map(([x, y, z]): Point3 => {
    const height = y - FLOOR_Y_OFFSET
    return [x, lakeWalkHeight(x, z, height) === height ? y : groundSurfaceHeight(x, z), z]
  }) : path
  return softenCurb(aligned)
}), 0.032)
