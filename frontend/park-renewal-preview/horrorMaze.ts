// The lower hall as a labyrinth (S15P31B105-450). It was one open hall: you walked in and saw the way out. Now stone
// walls 4.6 m high (well under the gallery, which looks down on them) split it into corridors with turnings and dead
// ends, around three open chambers: the one you arrive in, the cistern hall and the engine room. The way up (the
// ramp in the north-west corner) is the far end of a long, winding route from the arrival, with a single doorway.
//
// The grid follows the columns (every column stands on a corner of it) and leaves room round the cistern and the
// engines. The walls are a spanning tree of the cells (Kruskal, seeded, so the map never changes between builds),
// with some dead ends knocked through so it branches and loops instead of being a pure tree, and the doorways that
// a lamp, the diamond or the arrival needs always open. Pure data: horrorPlan builds it (HORROR_MAZE) against what
// already stands in the hall and adds the walls to HORROR_SOLIDS, so they are drawn, collide on the client and go
// into the server map like every other solid.

export type MazeWall = { id: string; x0: number; x1: number; z0: number; z1: number; height: number }

/** Grid lines across x (west → east) and z (north → south). Columns stand at x -15, -6, 3, 12 and z -57, -67, -89, -98. */
export const MAZE_X = [-48.75, -43.5, -38.5, -33, -26, -19.5, -15, -10.5, -6, -1.5, 3, 7.5, 12, 16.5, 21, 25.1] as const
export const MAZE_Z = [-48.9, -52.5, -57, -62, -67, -71.5, -76, -80.5, -85, -89, -93.5, -98, -104.1] as const
export const WALL = { height: 4.6, thickness: .5 } as const
/** Where you come down into the hall (interiorAccess.passage) and the foot of the ramp up. */
export const MAZE_ARRIVAL = [1.35, -50.3] as const
export const MAZE_GOAL = [-46, -55] as const

/** Open chambers: [first column, last column, first row, last row]. */
const ROOMS: Record<string, readonly [number, number, number, number]> = {
  arrival: [8, 10, 0, 1],
  goal: [0, 0, 0, 2],
  cistern: [3, 5, 3, 8],
  engines: [1, 2, 3, 8],
}
/** Points that must never have a wall over them: the lower lamps, the diamond, the way out of the arrival nook. */
const KEEP_CLEAR: readonly (readonly [number, number])[] = [
  [-20, -98], [20, -97], [19, -60], [-20, -55], [-36, -56], [-46.2, -79], [-30, -88], [24.5, -78.4],
  [18.1, -76.5], [3, -50.5],
]
/** Share of dead ends knocked through into a neighbour. */
export const BRAID = .6
/** The chosen layout (see the tests: the route from arrival to the ramp is long and keeps branching). */
export const MAZE_SEED = 321

/** `room`: the chamber it is part of. `node`: what the maze joins: a single cell, or the part of a chamber you can walk
 * through in one piece (the engines cut theirs in two). */
export type Cell = { i: number; j: number; room?: string; node: string; x: number; z: number }
type Edge = { a: Cell; b: Cell; x0: number; z0: number; x1: number; z1: number }

const COLS = MAZE_X.length - 1, ROWS = MAZE_Z.length - 1
/** South-west of the hall is solid rock (HORROR_OUTLINE). */
const excluded = (i: number, j: number) => MAZE_X[i + 1]! <= -26 && j >= 10
const roomOf = (i: number, j: number) => Object.keys(ROOMS).find(k => { const [i0, i1, j0, j1] = ROOMS[k]!; return i >= i0 && i <= i1 && j >= j0 && j <= j1 })

function random(seed: number) {
  let s = seed >>> 0
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
function segmentDistance(px: number, pz: number, e: Edge) {
  const dx = e.x1 - e.x0, dz = e.z1 - e.z0, t = Math.max(0, Math.min(1, ((px - e.x0) * dx + (pz - e.z0) * dz) / (dx * dx + dz * dz)))
  return Math.hypot(px - e.x0 - dx * t, pz - e.z0 - dz * t)
}

export interface Maze {
  walls: MazeWall[]
  cells: Cell[]
  /** Which neighbours each cell reaches directly (open doorways and the insides of chambers). */
  links: Map<Cell, Cell[]>
  cellAt(x: number, z: number): Cell | undefined
}

/** A doorway's line, for `passable`. */
export type Doorway = { x0: number; z0: number; x1: number; z1: number }

/**
 * The labyrinth for `seed`. `passable(doorway)` says whether you could actually walk through a doorway past what
 * already stands in the hall (a column, the engines, the cistern): one you could not is never counted as a way
 * through, and needs no wall either.
 */
export function buildMaze(seed = MAZE_SEED, passable: (d: Doorway) => boolean = () => true): Maze {
  const rng = random(seed)
  const grid: (Cell | undefined)[][] = []
  const cells: Cell[] = []
  for (let i = 0; i < COLS; i++) {
    grid[i] = []
    for (let j = 0; j < ROWS; j++) {
      if (excluded(i, j)) continue
      const room = roomOf(i, j)
      const cell: Cell = { i, j, room, node: `c${i}_${j}`, x: (MAZE_X[i]! + MAZE_X[i + 1]!) / 2, z: (MAZE_Z[j]! + MAZE_Z[j + 1]!) / 2 }
      grid[i]![j] = cell; cells.push(cell)
    }
  }
  const all: Edge[] = []
  for (const a of cells) {
    const east = grid[a.i + 1]?.[a.j], south = grid[a.i]?.[a.j + 1]
    for (const b of [east, south]) {
      if (!b) continue
      all.push(b === east
        ? { a, b, x0: MAZE_X[a.i + 1]!, x1: MAZE_X[a.i + 1]!, z0: MAZE_Z[a.j]!, z1: MAZE_Z[a.j + 1]! }
        : { a, b, x0: MAZE_X[a.i]!, x1: MAZE_X[a.i + 1]!, z0: MAZE_Z[a.j + 1]!, z1: MAZE_Z[a.j + 1]! })
    }
  }
  // Inside a chamber there are no walls, but what stands in it may still cut it in pieces: each piece is one node.
  const inner = all.filter(e => e.a.room && e.a.room === e.b.room && passable(e))
  const parent = new Map<string, string>()
  const find = (n: string): string => { let p = parent.get(n) ?? n; if (p !== n) { p = find(p); parent.set(n, p) } return p }
  const union = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra === rb) return false; parent.set(ra, rb); return true }
  for (const e of inner) union(e.a.node, e.b.node)
  for (const c of cells) if (c.room) c.node = c.room + ':' + find(c.node)
  parent.clear()
  const edges = all.filter(e => !(e.a.room && e.a.room === e.b.room) && passable(e))
  const open = new Set<Edge>()
  const touches = (e: Edge, room: string) => e.a.room === room || e.b.room === room
  const goalDoors = () => [...open].filter(e => touches(e, 'goal')).length
  // The doorways that must be there, then a random spanning tree, the way up kept to one doorway.
  for (const e of edges) if (KEEP_CLEAR.some(([x, z]) => segmentDistance(x, z, e) < 1.1)) { open.add(e); union(e.a.node, e.b.node) }
  const order = edges.map(e => ({ e, k: rng() })).sort((p, q) => p.k - q.k).map(p => p.e)
  for (const e of order) {
    if (open.has(e)) continue
    const toGoal = touches(e, 'goal')
    if (toGoal && goalDoors()) continue
    if (union(e.a.node, e.b.node)) open.add(e)
  }
  // Every node must be joined (the goal's single door may have been skipped above if it came late).
  for (const e of order) if (!open.has(e) && union(e.a.node, e.b.node)) open.add(e)
  const degree = (c: Cell) => [...open].filter(e => e.a === c || e.b === c).length
  // Knock through some of the dead ends (never into the way up): branches and loops, not one long tree.
  for (const c of cells) {
    if (c.room || degree(c) !== 1 || rng() > BRAID) continue
    const closed = edges.filter(e => !open.has(e) && (e.a === c || e.b === c) && !touches(e, 'goal'))
    if (closed.length) open.add(closed[Math.floor(rng() * closed.length)]!)
  }
  // The arrival chamber always offers a choice: two ways out.
  const arrivalDoors = () => [...open].filter(e => touches(e, 'arrival')).length
  for (const e of order) { if (arrivalDoors() >= 2) break; if (!open.has(e) && touches(e, 'arrival')) open.add(e) }

  const t = WALL.thickness / 2
  const walls: MazeWall[] = edges.filter(e => !open.has(e)).map(e => ({
    id: `maze-${e.a.i}-${e.a.j}-${e.b.i}-${e.b.j}`,
    x0: Math.min(e.x0, e.x1) - t, x1: Math.max(e.x0, e.x1) + t,
    z0: Math.min(e.z0, e.z1) - t, z1: Math.max(e.z0, e.z1) + t, height: WALL.height,
  }))
  const links = new Map<Cell, Cell[]>(cells.map(c => [c, []]))
  for (const e of open) { links.get(e.a)!.push(e.b); links.get(e.b)!.push(e.a) }
  for (const { a, b } of inner) { links.get(a)!.push(b); links.get(b)!.push(a) }
  const cellAt = (x: number, z: number) => {
    const i = MAZE_X.findIndex((v, k) => k < COLS && x >= v && x < MAZE_X[k + 1]!), j = MAZE_Z.findIndex((v, k) => k < ROWS && z <= v && z > MAZE_Z[k + 1]!)
    return i < 0 || j < 0 ? undefined : grid[i]?.[j]
  }
  return { walls, cells, links, cellAt }
}

/** The shortest way through, cell by cell (both ends included); empty if there is none. */
export function mazeRoute(maze: Maze, from: Cell, to: Cell): Cell[] {
  const dist = new Map<Cell, number>([[from, 0]]), prev = new Map<Cell, Cell>(), queue = [from]
  while (queue.length) {
    queue.sort((a, b) => dist.get(a)! - dist.get(b)!)
    const c = queue.shift()!
    if (c === to) break
    for (const n of maze.links.get(c)!) {
      const d = dist.get(c)! + Math.hypot(n.x - c.x, n.z - c.z)
      if (d < (dist.get(n) ?? Infinity)) { dist.set(n, d); prev.set(n, c); queue.push(n) }
    }
  }
  if (!dist.has(to)) return []
  const route = [to]
  while (route[0] !== from) route.unshift(prev.get(route[0]!)!)
  return route
}

/** A chalk arrow on the floor: where, and which way it points (a flat direction). */
export type MazeArrow = { x: number; z: number; dx: number; dz: number; /** Floor height (the hall's when left out). */ y?: number }
/**
 * The marks the one who went down first left on the floor (S15P31B105-450): at every turning on the way through
 * where you could go wrong (a crossing, or the doorway out of a chamber), an arrow just before the right doorway.
 */
export function mazeArrows(maze: Maze, route: Cell[]): MazeArrow[] {
  const arrows: MazeArrow[] = []
  for (let k = 0; k + 1 < route.length; k++) {
    const c = route[k]!, n = route[k + 1]!
    if (c.node === n.node) continue
    if (!c.room && maze.links.get(c)!.length < 3) continue
    const dx = Math.sign(n.i - c.i), dz = -Math.sign(n.j - c.j)
    // The doorway is on the shared edge; the arrow lies 1.3 m back from it, in the middle of the passage.
    const doorX = dx ? MAZE_X[Math.max(c.i, n.i)]! : c.x, doorZ = dz ? MAZE_Z[Math.max(c.j, n.j)]! : c.z
    arrows.push({ x: doorX - dx * 1.3, z: doorZ - dz * 1.3, dx, dz })
  }
  return arrows
}

/** Metres along the doorways from one cell to another (centre to centre), or Infinity. */
export function mazeDistance(maze: Maze, from: Cell, to: Cell) {
  const dist = new Map<Cell, number>([[from, 0]]), queue = [from]
  while (queue.length) {
    queue.sort((a, b) => dist.get(a)! - dist.get(b)!)
    const c = queue.shift()!
    if (c === to) return dist.get(c)!
    for (const n of maze.links.get(c)!) {
      const d = dist.get(c)! + Math.hypot(n.x - c.x, n.z - c.z)
      if (d < (dist.get(n) ?? Infinity)) { dist.set(n, d); queue.push(n) }
    }
  }
  return Infinity
}
