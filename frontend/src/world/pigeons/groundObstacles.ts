import type { BoxCollider } from '../../config'

const cellSize = 8
const clearance = 0.65

/** Static broad phase only. The exact footprint predicate is unchanged. */
export function createGroundObstacleQuery(obstacles: readonly BoxCollider[]) {
  const cells = new Map<number, Map<number, BoxCollider[]>>()
  for (const b of obstacles) {
    if (!(b.center[1] + b.half[1] > 0.1 && b.center[1] - b.half[1] < 4))
      continue
    const minX = Math.floor((b.center[0] - b.half[0] - clearance) / cellSize)
    const maxX = Math.floor((b.center[0] + b.half[0] + clearance) / cellSize)
    const minZ = Math.floor((b.center[2] - b.half[2] - clearance) / cellSize)
    const maxZ = Math.floor((b.center[2] + b.half[2] + clearance) / cellSize)
    for (let x = minX; x <= maxX; x++) {
      let row = cells.get(x)
      if (!row) cells.set(x, (row = new Map()))
      for (let z = minZ; z <= maxZ; z++) {
        const bucket = row.get(z)
        if (bucket) bucket.push(b)
        else row.set(z, [b])
      }
    }
  }
  return (x: number, z: number) => {
    const bucket = cells
      .get(Math.floor(x / cellSize))
      ?.get(Math.floor(z / cellSize))
    if (!bucket) return false
    for (const b of bucket)
      if (
        Math.abs(x - b.center[0]) < b.half[0] + clearance &&
        Math.abs(z - b.center[2]) < b.half[2] + clearance
      )
        return true
    return false
  }
}
