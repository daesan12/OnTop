import { describe, expect, it } from 'vitest'
import { MAZE_ARRIVAL, MAZE_GOAL, MAZE_SEED, MAZE_X, MAZE_Z, WALL, buildMaze, mazeDistance } from '../../park-renewal-preview/horrorMaze'
import { HORROR, HORROR_MAZE as MAZE, HORROR_SOLIDS, horrorWalkable, mazeDoorway } from '../../park-renewal-preview/horrorPlan'
import { HORROR_LAMPS } from '../../park-renewal-preview/horrorGeometry'
import { diamond } from '../../park-renewal-preview/interiorEvents'
import { interiorAccess, upperRamp } from '../../park-renewal-preview/interiorAccess'

// Everywhere you can walk from where you come down, on a 0.3 m grid, by the real walk test.
const STEP = .3, X0 = -58, Z0 = -105, NX = Math.ceil((26 - X0) / STEP), NZ = Math.ceil((-48 - Z0) / STEP)
const reached = (() => {
  const seen = new Uint8Array(NX * NZ), at = (x: number, z: number) => [Math.round((x - X0) / STEP), Math.round((z - Z0) / STEP)] as const
  const [sx, sz] = at(...MAZE_ARRIVAL)
  const queue = [sx * NZ + sz]; seen[queue[0]!] = 1
  while (queue.length) {
    const k = queue.pop()!, i = Math.floor(k / NZ), j = k % NZ
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di!, nj = j + dj!, n = ni * NZ + nj
      if (ni < 0 || nj < 0 || ni >= NX || nj >= NZ || seen[n]) continue
      if (!horrorWalkable(X0 + ni * STEP, Z0 + nj * STEP)) continue
      seen[n] = 1; queue.push(n)
    }
  }
  return (x: number, z: number, r = .5) => {
    for (let dx = -r; dx <= r; dx += STEP) for (let dz = -r; dz <= r; dz += STEP) {
      const [i, j] = at(x + dx, z + dz)
      if (seen[i * NZ + j]) return true
    }
    return false
  }
})()

describe('the lower hall is a labyrinth (horrorMaze)', () => {
  it('is the same every build, and its walls are in the hall\'s solids', () => {
    expect(buildMaze(MAZE_SEED, mazeDoorway).walls).toEqual(MAZE.walls)
    expect(MAZE.walls.length).toBeGreaterThan(90)
    for (const w of MAZE.walls) expect(HORROR_SOLIDS).toContain(w)
  })

  it('stands well under the gallery that looks down on it', () => {
    for (const w of MAZE.walls) expect(HORROR.floor + w.height).toBeLessThan(upperRamp.y0 - .4)
    expect(WALL.height).toBeGreaterThan(3.5) // over your head: you cannot see over it
  })

  it('takes the long way round from where you come down to the ramp, through one doorway', () => {
    const arrival = MAZE.cellAt(...MAZE_ARRIVAL)!, goal = MAZE.cellAt(...MAZE_GOAL)!
    const straight = Math.hypot(MAZE_GOAL[0] - MAZE_ARRIVAL[0], MAZE_GOAL[1] - MAZE_ARRIVAL[1])
    expect(mazeDistance(MAZE, arrival, goal)).toBeGreaterThan(straight * 3.5)
    const doors = MAZE.cells.filter(c => c.node === 'goal').flatMap(c => MAZE.links.get(c)!.filter(n => n.node !== 'goal'))
    expect(doors).toHaveLength(1)
    const arrivalDoors = MAZE.cells.filter(c => c.node === 'arrival').flatMap(c => MAZE.links.get(c)!.filter(n => n.node !== 'arrival'))
    expect(arrivalDoors.length).toBeGreaterThanOrEqual(2)
  })

  it('branches: many crossings and some dead ends, not one corridor', () => {
    const plain = MAZE.cells.filter(c => c.node.startsWith('c'))
    expect(plain.filter(c => MAZE.links.get(c)!.length >= 3).length).toBeGreaterThan(30)
    expect(plain.filter(c => MAZE.links.get(c)!.length === 1).length).toBeGreaterThan(15)
  })

  it('can be walked: the ramp, the diamond, the east door and every cell are reachable from the arrival', () => {
    expect(reached(-52, -57)).toBe(true)
    expect(reached(diamond[0], diamond[2], 1)).toBe(true)
    expect(reached(interiorAccess.return.from[0], interiorAccess.return.from[2])).toBe(true)
    for (const c of MAZE.cells) {
      const x0 = MAZE_X[c.i]!, x1 = MAZE_X[c.i + 1]!, z0 = MAZE_Z[c.j + 1]!, z1 = MAZE_Z[c.j]!
      // (cells the engines or the cistern fill have nowhere to stand)
      let floor = false, any = false
      for (let x = x0 + .6; x < x1 - .6 && !any; x += .5) for (let z = z0 + .6; z < z1 - .6 && !any; z += .5) {
        if (!horrorWalkable(x, z)) continue
        floor = true; any = reached(x, z, 0)
      }
      if (floor) expect(any, `cell ${c.i},${c.j}`).toBe(true)
    }
  })

  it('never walls over a lamp or the diamond', () => {
    const lower = HORROR_LAMPS.filter(([x]) => x > -49)
    for (const [x, z] of [...lower, [diamond[0], diamond[2]] as const])
      for (const w of MAZE.walls) expect(x > w.x0 - .4 && x < w.x1 + .4 && z > w.z0 - .4 && z < w.z1 + .4, `${x},${z} in ${w.id}`).toBe(false)
  })
})
