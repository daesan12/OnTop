import { describe, expect, it } from 'vitest'
import { MAZE_ARRIVAL, MAZE_GOAL, MAZE_SEED, WALL, buildMaze, mazeDistance, mazeRoute } from '../../park-renewal-preview/horrorMaze'
import { HORROR, HORROR_MAZE as MAZE, HORROR_MAZE_ARROWS, HORROR_SOLIDS, horrorWalkable, mazeDoorway } from '../../park-renewal-preview/horrorPlan'
import { HORROR_LAMPS } from '../../park-renewal-preview/horrorGeometry'
import { diamond } from '../../park-renewal-preview/interiorEvents'
import { upperStair } from '../../park-renewal-preview/interiorAccess'

describe('the lower hall is a labyrinth (horrorMaze)', () => {
  it('is the same every build, and its walls are in the hall\'s solids', () => {
    expect(buildMaze(MAZE_SEED, mazeDoorway).walls).toEqual(MAZE.walls)
    expect(MAZE.walls.length).toBeGreaterThan(90)
    for (const w of MAZE.walls) expect(HORROR_SOLIDS).toContain(w)
  })

  it('stands well under the gallery that looks down on it', () => {
    for (const w of MAZE.walls) expect(HORROR.floor + w.height).toBeLessThan(upperStair.y0 - .4)
    expect(WALL.height).toBeGreaterThan(3.5) // over your head: you cannot see over it
  })

  it('takes the long way round from where you come down to the ramp, through one doorway', () => {
    const arrival = MAZE.cellAt(...MAZE_ARRIVAL)!, goal = MAZE.cellAt(...MAZE_GOAL)!
    const straight = Math.hypot(MAZE_GOAL[0] - MAZE_ARRIVAL[0], MAZE_GOAL[1] - MAZE_ARRIVAL[1])
    expect(mazeDistance(MAZE, arrival, goal)).toBeGreaterThan(straight * 2.5)
    expect(mazeDistance(MAZE, arrival, goal)).toBeLessThan(straight * 3.5) // a winding way, not an ordeal
    const doors = MAZE.cells.filter(c => c.room === 'goal').flatMap(c => MAZE.links.get(c)!.filter(n => n.room !== 'goal'))
    expect(doors).toHaveLength(1)
    const arrivalDoors = MAZE.cells.filter(c => c.room === 'arrival').flatMap(c => MAZE.links.get(c)!.filter(n => n.room !== 'arrival'))
    expect(arrivalDoors.length).toBeGreaterThanOrEqual(2)
  })

  it('branches: many crossings, loops round and a few dead ends, not one corridor', () => {
    const plain = MAZE.cells.filter(c => !c.room)
    expect(plain.filter(c => MAZE.links.get(c)!.length >= 3).length).toBeGreaterThan(30)
    const dead = plain.filter(c => MAZE.links.get(c)!.length === 1).length
    expect(dead).toBeGreaterThan(2)
    expect(dead).toBeLessThan(12)
  })

  it('never walls over a lamp or the diamond', () => {
    const lower = HORROR_LAMPS.filter(([x]) => x > -49)
    for (const [x, z] of [...lower, [diamond[0], diamond[2]] as const])
      for (const w of MAZE.walls) expect(x > w.x0 - .4 && x < w.x1 + .4 && z > w.z0 - .4 && z < w.z1 + .4, `${x},${z} in ${w.id}`).toBe(false)
  })
})

describe('mazeRoute', () => {
  it('walks from the arrival to the ramp through open doorways only, as far as mazeDistance says', () => {
    const a = MAZE.cellAt(...MAZE_ARRIVAL)!, g = MAZE.cellAt(...MAZE_GOAL)!
    const route = mazeRoute(MAZE, a, g)
    expect(route[0]).toBe(a); expect(route.at(-1)).toBe(g)
    let length = 0
    for (let k = 1; k < route.length; k++) {
      expect(MAZE.links.get(route[k - 1]!)).toContain(route[k])
      length += Math.hypot(route[k]!.x - route[k - 1]!.x, route[k]!.z - route[k - 1]!.z)
    }
    expect(length).toBeCloseTo(mazeDistance(MAZE, a, g))
  })
})

describe('the chalk arrows', () => {
  it('mark every turning on the way where you could go wrong, each on open floor, pointing at the next doorway', () => {
    const route = mazeRoute(MAZE, MAZE.cellAt(...MAZE_ARRIVAL)!, MAZE.cellAt(...MAZE_GOAL)!)
    const turns = route.filter((c, k) => k + 1 < route.length && c.node !== route[k + 1]!.node && (c.room || MAZE.links.get(c)!.length >= 3))
    expect(HORROR_MAZE_ARROWS.length).toBeGreaterThanOrEqual(turns.length - 1)
    expect(HORROR_MAZE_ARROWS.length).toBeGreaterThan(5)
    for (const a of HORROR_MAZE_ARROWS) {
      expect(horrorWalkable(a.x, a.z, .3, HORROR.floor)).toBe(true)
      expect(Math.abs(a.dx) + Math.abs(a.dz)).toBe(1)
      // A step along the arrow is still on the way: the cell it points into is on the route.
      expect(route).toContain(MAZE.cellAt(a.x + a.dx * 2, a.z + a.dz * 2))
    }
  })
})
