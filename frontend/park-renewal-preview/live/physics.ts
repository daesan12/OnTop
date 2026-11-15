import { ShapeUtils, Vector2, type BufferGeometry } from 'three'
import { createTowerDeck, createTowerRamp, MOVEMENT, OBSERVATION_TOWER, TOWER_DECK_RAIL_SEGMENTS, towerPoint } from '../../src/config'
import { tableSeats, type TableAnchor } from '../../src/park/tablePlacement'
import { CENTRAL_RAIL_RUNS, STAIR_RAIL_RUNS, SITES as LEGACY_SITES } from '../../src/layout-preview/layout'
import { PARK_DATA } from '../../src/map/park'
import type { PhysicalBox, PhysicalHull, PhysicalMesh } from '../../src/map/park/physics'
import type { Point3 } from '../../src/map/park/interactionData'
import { BOUNDARY_LENGTH, GATE, boundaryAtDistance, WALL_RUNS } from '../boundaryPlan'
import { fountainAccessHeight } from '../fountainAccessSurface'
import { groundSurfaceHeight } from '../groundSurface'
import { HILLSIDE_RAIL_HEIGHTS, MONUMENT_STAIR_RAIL } from '../guardDimensions'
import { hillsideGuardRuns, ascentFenceRuns } from '../guardLayout'
import { JUMP_FENCE_HEIGHT, jumpFenceRuns } from '../jumpFencePlan'
import { bridgeApproachGuards, lakeFenceSegments } from '../lakePlan'
import { summitWalls, SUMMIT_WALL_FACE_OFFSET } from '../summitWalls'
import { SUMMIT_HEIGHT } from '../hybridTerrainPlan'
import { fitnessFenceSegments } from '../motionPlan'
import {
  BOAT_ROUTE, BRIDGE, BRIDGE_LANDINGS, DOCK_ACCESS, DOCK_SCALE, FISHING_ACCESS, FISHING_OUTLINE, FISHING_DECK, FISHING_UPPER, FISHING_STAIRS,
  LAKE, MONUMENT_STAIRS, REST_PAVILIONS, STATION_APPROACH, STATION_SHELTER, STATION_STAIRS, SUB_PAVILION_SCALE,
  accessTopAt, bridgeDeckHeight, bridgeLandingHeight, facilityGroundY, fishingRailSections, heightAt, inLake, site, type Point,
} from '../plan'
import { parkPropBlockers } from '../propCollision'
import { DOCK_REAR_RAIL } from '../dockRailPlan'
import { REST_FURNITURE_VERTICAL_SCALE, SPECTATOR_BENCH_HEIGHTS } from '../pavilionBenchLayout'
import { towerRampStartY } from '../towerEntrance'
import { facilityYaw } from '../facilityPlacement'
import { HORROR, HORROR_CRYPT, HORROR_PORTALS, HORROR_SOLIDS } from '../horrorPlan'
import { horrorShell } from '../horrorGeometry'
import { annex, annexVolumes, galleryVolumes, interiorAccess, passageVolumes, SECRET_ENTRANCES_OPEN, upperArrival, upperRamp, upperRoomVolumes } from '../interiorAccess'

export const RENEWAL_HALF_SIZE = 110
export const RENEWAL_SPAWN = [0, 96] as const
type RenewalMesh = Omit<PhysicalMesh, 'role'> & { role: PhysicalMesh['role'] | 'solid' }
const subScale = 1.1 * SUB_PAVILION_SCALE
const monument = MONUMENT_STAIRS
const fountain = site('fountain')
const tower = site('tower')
const basePhysics = PARK_DATA.physics
const quantize = (n: number) => Math.round(n * 1000) / 1000

function transform([x, z]: Point, cx: number, cz: number, yaw: number): Point {
  const c = Math.cos(yaw), s = Math.sin(yaw)
  return [cx + c * x + s * z, cz - s * x + c * z]
}

function heightfield() {
  const half = RENEWAL_HALF_SIZE, side = half * 2 + 1
  const vertices: number[] = [], indices: number[] = []
  const secretTerrainCuts: number[] = []
  for (let row = 0; row < side; row++) for (let col = 0; col < side; col++) {
    const x = col - half, z = row - half
    const dx = x - fountain.x, dz = z - fountain.z
    let y = groundSurfaceHeight(x, z)
    if (Math.hypot(dx, dz) < 17.608) y = heightAt(fountain.x, fountain.z) + fountainAccessHeight(dx, dz)
    if (inLake(x, z)) {
      const radius = Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz)
      y = LAKE.y - 3 * Math.min(1, (1 - radius) / .14)
      // Start a shallow seabed ramp along the whole island shore.
      const island = LAKE.island
      const shoreDistance = (Math.hypot((x - island.x) / island.rx, (z - island.z) / island.rz) - 1)
        * Math.min(island.rx, island.rz)
      y = Math.max(y, 4.2 - Math.max(0, shoreDistance) * .48)
    }
    if (Math.abs(x - monument.x) <= monument.width / 2 && z > monument.zTop && z < monument.zBottom) {
      const t = (z - monument.zTop) / (monument.zBottom - monument.zTop)
      y = monument.top + (monument.bottom - monument.top) * t - .18
    }
    vertices.push(x, quantize(y), z)
    if (row && col) {
      const a = (row - 1) * side + col - 1
      // Keep the height lookup grid intact. Only remove the cliff triangles that
      // slope across the two portals; the masonry still defines their edges.
      const underStair = x > -2 && x <= 2 && z > -48 && z <= -39
      if (SECRET_ENTRANCES_OPEN && (underStair || HORROR_PORTALS.some(p => x === p.x + (p.outward > 0 ? 1 : 0)
        && z > p.z - p.width / 2 && z - 1 < p.z + p.width / 2))) {
        secretTerrainCuts.push(indices.length / 3, indices.length / 3 + 1)
      }
      indices.push(a, a + side, a + 1, a + 1, a + side, a + side + 1)
    }
  }
  return { terrain: { id: 'terrain', role: 'terrain', vertices, indices } satisfies PhysicalMesh, secretTerrainCuts }
}

export function buildRenewalPhysics(tables: readonly TableAnchor[]) {
  const { terrain, secretTerrainCuts } = heightfield()
  const meshes: RenewalMesh[] = [terrain], boxes: PhysicalBox[] = [], hulls: PhysicalHull[] = []
  const putBox = (id: string, center: Point3, half: Point3, yaw = 0) => boxes.push({ id, center, half, yaw, role: 'solid' })
  const rail = (id: string, a: Point3, b: Point3, thickness: number, height: number, overlap = .015) => {
    const dx = b[0] - a[0], dz = b[2] - a[2], length = Math.hypot(dx, dz)
    if (length < .01) return
    putBox(id, [(a[0] + b[0]) / 2, (a[1] + b[1] + height) / 2, (a[2] + b[2]) / 2],
      [length / 2 + overlap, height / 2, thickness / 2], Math.atan2(-dz, dx))
  }
  const floor = (id: string, outline: readonly Point[], y: (x: number, z: number) => number) => {
    const indices = ShapeUtils.triangulateShape(outline.map(([x, z]) => new Vector2(x, z)), [])
      .flatMap(([a, b, c]) => {
        const p = outline[a!]!, q = outline[b!]!, r = outline[c!]!
        const area = (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
        return area > 0 ? [a!, c!, b!] : [a!, b!, c!]
      })
    meshes.push({ id, role: 'surface', vertices: outline.flatMap(([x, z]) => [x, y(x, z), z]), indices })
  }
  const deckBody = (id: string, outline: readonly Point[], bottom: number, top: number) => {
    hulls.push({ id, role: 'solid', vertices: [bottom, top].flatMap(y => outline.flatMap(([x, z]) => [x, y, z])) })
  }
  const slopedRail = (id: string, a: Point3, b: Point3, thickness: number, height: number) => {
    const dx = b[0] - a[0], dz = b[2] - a[2], length = Math.hypot(dx, dz)
    const nx = -dz / length * thickness / 2, nz = dx / length * thickness / 2
    hulls.push({ id, role: 'solid', vertices: [0, height].flatMap(y =>
      [a, b].flatMap(([x, floor, z]) => [-1, 1].flatMap(side => [x + side * nx, floor + y, z + side * nz]))) })
  }
  const octagon = (x: number, z: number, radius: number, yaw: number) =>
    Array.from({ length: 8 }, (_, i) => {
      const angle = (i + .5) * Math.PI / 4
      return transform([radius * Math.sin(angle), radius * Math.cos(angle)], x, z, yaw)
    })
  const deck = (id: string, x: number, z: number, radius: number, y: number, yaw = 0) =>
    floor(id, octagon(x, z, radius, yaw), () => y)
  const ramp = (id: string, x: number, z: number, width: number, start: number, end: number, y0: number, y1: number, yaw = 0) => {
    const corners: Point[] = [[-width / 2, start], [width / 2, start], [width / 2, end], [-width / 2, end]]
    floor(id, corners.map(p => transform(p, x, z, yaw)), (px, pz) =>
      y0 + (y1 - y0) * (((px - x) * Math.sin(yaw) + (pz - z) * Math.cos(yaw) - start) / (end - start)))
  }
  const fromGeometry = (id: string, g: BufferGeometry, role: RenewalMesh['role']) => {
    const p = g.getAttribute('position')
    const vertices = Array.from(p.array, quantize)
    const indices = g.index ? Array.from(g.index.array) : Array.from({ length: p.count }, (_, i) => i)
    meshes.push({ id, vertices, indices, role })
  }
  const cylinder = (id: string, x: number, z: number, radius: number, bottom: number, top: number) =>
    hulls.push({ id, role: 'solid', vertices: [bottom, top].flatMap(y =>
      Array.from({ length: 32 }, (_, i) => [x + radius * Math.cos(i * Math.PI / 16), y, z + radius * Math.sin(i * Math.PI / 16)]).flat()) })

  // Keep the visual wall and gate open to view. Collision follows the full
  // perimeter, including the gate, above the highest possible throw.
  const boundaryBottom = -16, boundaryTop = 256
  const boundaryRuns = [...WALL_RUNS,
    { start: 0, end: GATE.opening / 2 },
    { start: BOUNDARY_LENGTH - GATE.opening / 2, end: BOUNDARY_LENGTH }]
  boundaryRuns.forEach(({ start, end }, i) => {
    const a = boundaryAtDistance(start), b = boundaryAtDistance(end)
    rail('park-wall-' + i, [a.x, boundaryBottom, a.z], [b.x, boundaryBottom, b.z], .62,
      boundaryTop - boundaryBottom)
  })
  // Use continuous volumes against the outside face. The wall plan omits the staircase and trail.
  summitWalls.forEach(({ a, b, nx, nz }, i) => {
    const thickness = .85, shift = SUMMIT_WALL_FACE_OFFSET - thickness / 2
    const dx = b[0] - a[0], dz = b[1] - a[1]
    const wallRun = (id: string, start: number, end: number, low: number, high: number) => {
      if (end <= start || high <= low) return
      rail(id, [a[0] + dx * start + nx * shift, low, a[1] + dz * start + nz * shift],
        [a[0] + dx * end + nx * shift, low, a[1] + dz * end + nz * shift], thickness, high - low, .10)
    }
    const bottom = Math.min(groundSurfaceHeight(a[0] + nx * 2, a[1] + nz * 2),
      groundSurfaceHeight(b[0] + nx * 2, b[1] + nz * 2)) - 1.6
    const top = SUMMIT_HEIGHT + 2.4, id = 'summit-retaining-solid-' + i
    const portal = HORROR_PORTALS.find(p => Math.abs(a[0] - p.x) < .01 && Math.abs(b[0] - p.x) < .01
      && p.z > Math.min(a[1], b[1]) && p.z < Math.max(a[1], b[1]))
    if (!portal) { wallRun(id, 0, 1, bottom, top); return }
    // The upper barrier remains continuous over the authorized lower doorway.
    const near = (portal.z - portal.width / 2 - .13 - a[1]) / dz
    const far = (portal.z + portal.width / 2 + .13 - a[1]) / dz
    wallRun(id + '-left', 0, Math.min(near, far), bottom, top)
    wallRun(id + '-right', Math.max(near, far), 1, bottom, top)
    wallRun(id + '-lintel', Math.min(near, far), Math.max(near, far), portal.floor + portal.height + .03, top)
    wallRun(id + '-sill', Math.min(near, far), Math.max(near, far), bottom, portal.floor - .03)
  })
  fromGeometry('secret-corridor-shell', horrorShell.stone!, 'solid')
  floor('interior-main-floor', [[-58,-94],[-26,-94],[-26,-105],[26,-105],[26,-48],[-58,-48]], () => HORROR.floor)
  const exit = HORROR_PORTALS[1]
  ramp('secret-corridor-ramp', -52, 0, 5, -80, -55, exit.floor, HORROR.floor)
  floor('secret-corridor-ramp-top', [[-54.5, -84.3], [-49.5, -84.3], [-49.5, -80], [-54.5, -80]], () => exit.floor)
  floor('secret-corridor-landing', [[-58, -94], [-49, -94], [-49, -84.3], [-58, -84.3]], () => exit.floor)
  for (const p of HORROR_PORTALS) {
    const exterior = p.x + p.outward * 3.6
    floor('secret-corridor-apron-' + p.id, [[p.x, p.z - p.width / 2], [exterior, p.z - p.width / 2],
      [exterior, p.z + p.width / 2], [p.x, p.z + p.width / 2]], () => p.floor)
    putBox('interior-portal-' + p.id, [p.x, p.floor + p.height / 2, p.z], [.18, p.height / 2, p.width / 2])
  }
  for (const [index, volume] of [...annexVolumes, ...passageVolumes, ...galleryVolumes, ...upperRoomVolumes].entries()) {
    const [w, h, d] = volume.size
    putBox('interior-volume-' + index, volume.center, [w / 2, h / 2, d / 2])
  }
  ramp('interior-upper-access', upperRamp.x, 0, upperRamp.width, upperRamp.z0, upperRamp.z1, upperRamp.y0, upperRamp.y1)
  for (const s of HORROR_SOLIDS) putBox('secret-corridor-' + s.id,
    [(s.x0 + s.x1) / 2, HORROR.floor + s.height / 2, (s.z0 + s.z1) / 2],
    [(s.x1 - s.x0) / 2, s.height / 2, (s.z1 - s.z0) / 2])
  cylinder('secret-corridor-cistern', HORROR_CRYPT.x, HORROR_CRYPT.z, HORROR_CRYPT.rx, HORROR.floor,
    HORROR.floor + HORROR_CRYPT.height)
  for (const [style, runs, height] of [
    ['hill-rail', hillsideGuardRuns, HILLSIDE_RAIL_HEIGHTS[1] + .05],
    ['ascent-rail', ascentFenceRuns, 1.1], ['jump-garden-fence', jumpFenceRuns, JUMP_FENCE_HEIGHT],
  ] as const) for (const [i, run] of runs.entries()) {
    for (let n = 1; n < run.length; n++) rail(style + '-' + i + '-' + n, run[n - 1]!, run[n]!, .12, height)
  }
  const lakeFence = lakeFenceSegments()
  for (const [name, segments, h] of [['lake-fence', lakeFence, 1.12],
    ['island-bridge-approach-guard', bridgeApproachGuards(lakeFence), 1.12],
    ['fitness-fence', fitnessFenceSegments(), 1.1]] as const) {
    segments.forEach(({ a, z }, i) => rail(name + '-' + i,
      [a[0], groundSurfaceHeight(...a), a[1]], [z[0], groundSurfaceHeight(...z), z[1]], .14, h))
  }
  const outdoorTableIds = new Set(tables.filter(table => !table.pavilionId).map(table => table.id))
  parkPropBlockers.forEach((b, i) => {
    // The service table below already covers these art parts and owns no-climb and chair activation.
    if (b.serviceTableId && outdoorTableIds.has(b.serviceTableId)) return
    const id = 'park-prop-' + i
    if (b.kind === 'circle') cylinder(id, b.x, b.z, b.radius, b.bottom, b.top)
    else putBox(id, [b.x, (b.bottom + b.top) / 2, b.z], [b.halfX, (b.top - b.bottom) / 2, b.halfZ], Math.atan2(b.sin, b.cos))
  })
  // Service table columns keep the existing no-climb policy and two visible stone seats.
  for (const table of tables) {
    const [x, floor, z] = table.position, h = basePhysics.furniturePolicy.movementHeight / 2
    if (!table.pavilionId) putBox(table.id + '-top', [x, floor + h, z], [1.05, h, .8])
    tableSeats(table).forEach((seat, n) => {
      if (table.pavilionId && n < 2) return // Native stools already have a physical proxy.
      const halfX = n < 2 ? 1.05 : .425
      putBox(table.id + '-chair-' + n, [x + seat.x, floor + h, z + seat.z], [halfX, h, .26], seat.yaw)
    })
  }
  const main = site('pavilion'), mainBase = facilityGroundY(main) + .115
  deck('main-pavilion-floor', main.x, main.z, 9.4, mainBase + 2.6)
  const lowerRadius = 9.812 / Math.cos(Math.PI / 8)
  deck('main-pavilion-lower-terrace', main.x, main.z, lowerRadius, mainBase + 1.3)
  deckBody('main-pavilion-plinth', octagon(main.x, main.z, lowerRadius - .06, 0), mainBase - .5, mainBase + 1.25)
  deckBody('main-pavilion-upper-plinth', octagon(main.x, main.z, 9.34, 0), mainBase + 1.23, mainBase + 2.55)
  for (let i = 0; i < 4; i++) {
    const yaw = i * Math.PI / 2, width = i === 0 ? 4.37 : 2.97
    const start = 9.026, end = 13.606, rise = 2.6
    const stairY = (z: number) => mainBase + (end - z) / (end - start) * rise
    ramp('main-pavilion-landing-' + i, main.x, main.z, width, 8.65, start, mainBase + rise, mainBase + rise, yaw)
    // A single solid walkable ramp avoids overlapping stair faces and closes the cheek below the rail.
    const outline: Point[] = [[-width / 2, start], [width / 2, start], [width / 2, end], [-width / 2, end]]
    const vertices = [false, true].flatMap(top => outline.flatMap(([x, z]) => {
      const [wx, wz] = transform([x, z], main.x, main.z, yaw)
      return [wx, top ? stairY(z) : mainBase - .45, wz]
    }))
    hulls.push({ id: 'main-pavilion-stair-body-' + i, role: 'solid', vertices })
    for (const side of [-1, 1]) {
      const point = (z: number): Point3 => {
        const [x, worldZ] = transform([side * (width / 2 + .12), z], main.x, main.z, yaw)
        return [x, stairY(z) - .26, worldZ]
      }
      slopedRail('main-pavilion-stair-rail-' + i + '-' + side, point(start - .04), point(end), .28, 1.32)
    }
  }
  const mainFloor = mainBase + 2.6
  const pavilions = [{ id: 'P0', x: main.x, z: main.z, floor: mainFloor, scale: 2,
    spectatorBenchTop: mainFloor + SPECTATOR_BENCH_HEIGHTS.main }]
  for (const [i, [x, z]] of [...REST_PAVILIONS, [LAKE.island.x, LAKE.island.z] as Point].entries()) {
    const island = i === REST_PAVILIONS.length
    const yaw = facilityYaw(site(island ? 'island-pavilion' : 'rest-' + (i + 1)))
    const base = island ? 4.2 : heightAt(x, z), top = base + .572 * subScale
    deck('rest-pavilion-floor-' + i, x, z, 2.97 * subScale, top, yaw)
    deckBody('rest-pavilion-plinth-' + i, octagon(x, z, 2.93 * subScale, yaw), base - .45, top - .045)
    const treads = [[2.62, 3.09, .572], [3.09, 3.23, .475], [3.23, 3.43, .38],
      [3.43, 3.57, .285], [3.57, 3.77, .19], [3.77, 3.89, .095]] as const
    for (const [j, [from, to, rise]] of treads.entries()) {
      const [sx, sz] = transform([0, (from + to) * subScale / 2], x, z, yaw)
      const thickness = (rise + .13) * subScale
      putBox('rest-pavilion-tread-' + i + '-' + j, [sx, base + rise * subScale - thickness / 2, sz],
        [1.52 * subScale / 2, thickness / 2, (to - from) * subScale / 2], yaw)
    }
    pavilions.push({ id: ['P1', 'P3', 'P4', 'P2', 'P5'][i]!, x, z, floor: top, scale: subScale / 1.52,
      spectatorBenchTop: top + SPECTATOR_BENCH_HEIGHTS.rest * subScale * REST_FURNITURE_VERTICAL_SCALE })
  }
  const pagoda = site('pagoda'), pg = heightAt(pagoda.x, pagoda.z)
  ramp('pagoda-terrace', pagoda.x, pagoda.z, 26, -13, 13, pg + 1.8, pg + 1.8)
  deckBody('pagoda-terrace-body', [[pagoda.x - 13, pagoda.z - 13], [pagoda.x + 13, pagoda.z - 13],
    [pagoda.x + 13, pagoda.z + 13], [pagoda.x - 13, pagoda.z + 13]], pg - .6, pg + 1.75)
  for (let i = 0; i < 4; i++) ramp('pagoda-stairs-' + i, pagoda.x, pagoda.z, 6, 13, 17, pg + 1.8, pg + .085, i * Math.PI / 2)
  const railWorld = ([x, z]: Point): Point => [pagoda.x + x - LEGACY_SITES.pagoda.x, pagoda.z + z - LEGACY_SITES.pagoda.z]
  for (const [i, run] of CENTRAL_RAIL_RUNS.entries()) {
    const a = railWorld(run.from), b = railWorld(run.to)
    rail('pagoda-terrace-rail-' + i, [a[0], pg + 1.8, a[1]], [b[0], pg + 1.8, b[1]], .46, 1.28, .05)
  }
  for (const [i, run] of STAIR_RAIL_RUNS.entries()) {
    const a = railWorld(run.from), b = railWorld(run.to)
    for (let j = 0; j < 10; j++) {
      const point = (t: number): Point3 => [a[0] + (b[0] - a[0]) * t, pg + 1.8 * (1 - t), a[1] + (b[1] - a[1]) * t]
      rail('pagoda-stair-rail-' + i + '-' + j, point(j / 10), point((j + 1) / 10), .44, 1.28, .045)
    }
  }
  ramp('monument-stairs', monument.x, 0, monument.width, monument.zTop, monument.zBottom, monument.top + .085, monument.bottom + .085)
  const stairRail = MONUMENT_STAIR_RAIL
  for (const side of [-1, 1]) for (let i = 0; i < monument.steps; i++) {
    const x = monument.x + side * (monument.width / 2 + stairRail.sideOffset)
    const at = (n: number): Point3 => [x, monument.top + (monument.bottom - monument.top) * n / monument.steps,
      monument.zTop + (monument.zBottom - monument.zTop) * n / monument.steps]
    rail('monument-rail-' + side + '-' + i, at(i), at(i + 1), stairRail.postWidth, stairRail.height)
  }
  for (const side of [-1, 1]) {
    const x = monument.x + side * (monument.width / 2 + stairRail.sideOffset)
    rail('monument-rail-landing-joint-' + side, [x, monument.top - .16, monument.zTop - .75],
      [x, monument.top - .16, monument.zTop + .48], .24, 1.62, .08)
  }
  const station = site('balloon'), by = heightAt(station.x, station.z)
  const balloonScale = 1.7
  ramp('balloon-boarding-floor', station.x, station.z, 18, -10, STATION_STAIRS.zTop, by + STATION_STAIRS.top, by + STATION_STAIRS.top)
  ramp('balloon-boarding-stairs', station.x, station.z, STATION_STAIRS.width, STATION_STAIRS.zTop, STATION_STAIRS.zBottom,
    by + .65 * balloonScale, groundSurfaceHeight(...STATION_APPROACH.b))
  const shelter = STATION_SHELTER, shelterX = station.x + shelter.x, shelterZ = station.z + shelter.z
  const shelterTop = by + shelter.floor, front = shelter.depth / 2
  ramp('balloon-shelter-floor', shelterX, shelterZ, shelter.width, -front, front, shelterTop, shelterTop)
  ramp('balloon-shelter-entrance', shelterX, shelterZ, shelter.entryWidth, front, front + shelter.entryRun,
    shelterTop, by + STATION_STAIRS.top)

  const strip = (id: string, x0: number, x1: number, z: number, width: number, top: (x: number) => number) => {
    const count = Math.ceil((x1 - x0) / .18), vertices: number[] = [], indices: number[] = []
    for (let n = 0; n <= count; n++) {
      const x = x0 + (x1 - x0) * n / count
      vertices.push(x, top(x), z - width / 2, x, top(x), z + width / 2)
      if (n) { const a = (n - 1) * 2; indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2) }
    }
    meshes.push({ id, vertices, indices, role: 'surface' })
  }
  strip('island-bridge', BRIDGE.x0, BRIDGE.x1, BRIDGE.z, BRIDGE.width, bridgeDeckHeight)
  BRIDGE_LANDINGS.forEach((l, i) => strip('island-bridge-landing-' + i, l.x0, l.x1, BRIDGE.z, l.width, x => bridgeLandingHeight(l, x)))
  for (const side of [-1, 1]) for (let i = 0; i < 44; i++) {
    const z = BRIDGE.z + side * BRIDGE.width / 2
    const x = (n: number) => BRIDGE.x0 + (BRIDGE.x1 - BRIDGE.x0) * n / 44
    rail('island-bridge-rail-' + side + '-' + i, [x(i), bridgeDeckHeight(x(i)), z], [x(i + 1), bridgeDeckHeight(x(i + 1)), z], .12, 1.06)
  }
  for (const [name, access] of [['dock', DOCK_ACCESS], ['fishing', FISHING_ACCESS]] as const) {
    for (let i = 1; i < access.points.length; i++) {
      const a = access.points[i - 1]!, b = access.points[i]!, dx = b[0] - a[0], dz = b[1] - a[1]
      const yaw = Math.atan2(dx, dz), length = Math.hypot(dx, dz)
      const width = access.width / 2, c = Math.cos(yaw), s = Math.sin(yaw)
      const normal = (from: Point, to: Point): Point => {
        const x = to[0] - from[0], z = to[1] - from[1], d = Math.hypot(x, z)
        return [z / d, -x / d]
      }
      const corner = (at: Point, other: Point | undefined, previous: boolean, side: number): Point => {
        const adjacent = other ? (previous ? normal(other, at) : normal(at, other)) : [c, -s]
        const alignment = 1 + c * adjacent[0]! - s * adjacent[1]!
        return [at[0] + (c + adjacent[0]!) * side * width / alignment,
          at[1] + (-s + adjacent[1]!) * side * width / alignment]
      }
      const endAt = (side: number, t: number): Point => {
        const from = corner(a, access.points[i - 2], true, side), to = corner(b, access.points[i + 1], false, side)
        return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t]
      }
      for (const side of [-1, 1]) {
        // Rails follow the rise while leaving both approaches unobstructed.
        const n = Math.ceil(length / .55)
        for (let j = 0; j < n; j++) {
          const from = endAt(side, j / n), to = endAt(side, (j + 1) / n)
          rail(name + '-walk-rail-' + i + '-' + side + '-' + j,
            [from[0], accessTopAt(access, ...from) - .05, from[1]],
            [to[0], accessTopAt(access, ...to) - .05, to[1]], .15, 1.17, .06)
        }
      }
      hulls.push({ id: name + '-walk-frame-' + i, role: 'solid',
        vertices: [.05, .27].flatMap(depth => [[-1, 0], [1, 0], [-1, 1], [1, 1]].flatMap(([side, t]) => {
          const [x, z] = endAt(side!, t!)
          return [x, accessTopAt(access, x, z) - depth, z]
        })) })
      const bend = access === DOCK_ACCESS ? access.width / 2 : 0
      if (i === 1 && bend) {
        ramp('dock-access-incline', ...a, access.width, 0, length - bend, accessTopAt(access, ...a), access.top, yaw)
        ramp('dock-access-landing', ...a, access.width, length - bend, length + bend, access.top, access.top, yaw)
      } else ramp(name + '-access-' + i, ...a, access.width, i > 1 ? -bend : 0, length, accessTopAt(access, ...a), accessTopAt(access, ...b), yaw)
    }
  }
  const dock = site('dock')
  const dockSlab = (id: string, x0: number, x1: number, z0: number, z1: number, top: number) => {
    putBox(id, [dock.x + (x0 + x1) / 2, top - .2, dock.z + (z0 + z1) / 2],
      [(x1 - x0) / 2, .2, (z1 - z0) / 2])
  }
  dockSlab('duck-dock-base', -5.625, 5.625, -1.5, 3.438, LAKE.y + .65 * DOCK_SCALE)
  const dockTop = LAKE.y + .65 * DOCK_SCALE
  // Keep the walkway behind the booth and the west-side approach open.
  putBox('duck-dock-booth', [dock.x, dockTop + 1.23, dock.z - .06], [1.92, 1.23, 1.1])
  for (const side of [-1, 1]) {
    const x = dock.x + side * 5.38
    rail('duck-dock-rail-' + side, [x, dockTop, dock.z - 5.55],
      [x, dockTop, dock.z + (side === -1 ? .67 : DOCK_REAR_RAIL.z * DOCK_SCALE)], .13, 1.12, .035)
  }
  const rearZ = dock.z + DOCK_REAR_RAIL.z * DOCK_SCALE
  rail('duck-dock-rear-rail',
    [dock.x + DOCK_REAR_RAIL.posts[0] * DOCK_SCALE, dockTop, rearZ],
    [dock.x + DOCK_REAR_RAIL.posts.at(-1)! * DOCK_SCALE, dockTop, rearZ], .17, .95, .10)
  rail('duck-dock-rear-west-return',
    [dock.x + DOCK_REAR_RAIL.westReturn[0] * DOCK_SCALE, dockTop, dock.z + DOCK_REAR_RAIL.westReturn[1] * DOCK_SCALE],
    [dock.x + DOCK_REAR_RAIL.posts[0] * DOCK_SCALE, dockTop, rearZ], .17, .95, .10)
  for (const side of [-1, 1]) {
    dockSlab('duck-dock-finger-' + side, side === 1 ? 3.625 : -5.5, side === 1 ? 5.5 : -3.625,
      -5.625, -1.49, LAKE.y + .65 * DOCK_SCALE)
    putBox('duck-boat-moored-' + side, [dock.x + side * 2.1, LAKE.y + .25, dock.z - 3.7], [.83, .76, 1.45])
  }
  deckBody('fishing-deck', FISHING_OUTLINE, FISHING_DECK.base, FISHING_DECK.top)
  deckBody('fishing-upper-deck', FISHING_UPPER.outline, FISHING_UPPER.top - .47, FISHING_UPPER.top)
  ramp('fishing-stairs', FISHING_STAIRS.x, 0, FISHING_STAIRS.width, FISHING_STAIRS.zTop, FISHING_STAIRS.zBottom,
    FISHING_STAIRS.top, FISHING_STAIRS.bottom)
  const stairs = FISHING_STAIRS
  // Enclose the stair flight underneath without putting a second surface above the walkable ramp.
  hulls.push({ id: 'fishing-stair-body', role: 'solid', vertices: [-1, 1].flatMap(side => {
    const x = stairs.x + side * (stairs.width / 2 - .025)
    return [x, stairs.bottom - .14, stairs.zTop, x, stairs.bottom - .14, stairs.zBottom,
      x, stairs.top - .025, stairs.zTop, x, stairs.bottom - .025, stairs.zBottom]
  }) })
  fishingRailSections().forEach((r, i) => rail('fishing-rail-' + i, [r.a[0], r.floor, r.a[1]], [r.b[0], r.endFloor, r.b[1]], .13, 1.12))

  const towerScale = 40 / OBSERVATION_TOWER.height, towerBase = heightAt(tower.x, tower.z)
  const towerWorld = ([x, y, z]: Point3): Point3 => [tower.x - x + OBSERVATION_TOWER.x, towerBase + y * towerScale, tower.z - z + OBSERVATION_TOWER.z]
  for (const [id, create] of [['tower-ramp', createTowerRamp], ['tower-deck', createTowerDeck]] as const) {
    const m = create(), vertices: number[] = []
    for (let i = 0; i < m.vertices.length; i += 3) vertices.push(...towerWorld([m.vertices[i]!, m.vertices[i + 1]!, m.vertices[i + 2]!]))
    meshes.push({ id, role: 'surface', vertices, indices: Array.from(m.indices) })
  }
  for (const radius of [OBSERVATION_TOWER.inner, OBSERVATION_TOWER.outer]) for (let i = 0; i < 180; i++) {
    if (radius === OBSERVATION_TOWER.inner && i === 179) continue
    rail('tower-rail-' + radius + '-' + i, towerWorld(towerPoint(i / 180, radius)), towerWorld(towerPoint((i + 1) / 180, radius)), .13, 1.37)
  }
  TOWER_DECK_RAIL_SEGMENTS.forEach(([a, b], i) => rail('tower-top-rail-' + i, towerWorld(a), towerWorld(b), .14, 1.37))
  const fountainY = heightAt(fountain.x, fountain.z)
  const fountainPolicy = { ...basePhysics.fountainPolicy, x: fountain.x, z: fountain.z,
    bottom: fountainY + basePhysics.fountainPolicy.bottom, top: fountainY + basePhysics.fountainPolicy.top }
  cylinder('fountain-basin', fountain.x, fountain.z, fountainPolicy.radius, fountainPolicy.bottom, fountainPolicy.top)
  const groundClearance = 0
  const spawnY = groundSurfaceHeight(...RENEWAL_SPAWN) + MOVEMENT.halfHeight + MOVEMENT.radius + MOVEMENT.offset + groundClearance
  // The enlarged benches need more clearance under the tuned jump's stronger gravity.
  const physics = { ...basePhysics, boxes, hulls, meshes, fountainPolicy, steppingStones: [], pavilionTunedJumpSpeed: 9.8,
    secretCorridor: { x0: HORROR.x0, x1: HORROR.x1, z0: HORROR.z0, z1: HORROR.z1, floor: HORROR.floor, ceiling: HORROR.ceiling },
    secretTerrainCuts, duckBoat: BOAT_ROUTE,
    interiorAccess: { routes: interiorAccess, annex, upperArrival, entrancesOpen: SECRET_ENTRANCES_OPEN },
    tower: { ...basePhysics.tower, x: tower.x, z: tower.z, height: 40, topY: towerRampStartY + 40, surfaceOffset: towerRampStartY },
    terrain: { ...basePhysics.terrain, halfSize: RENEWAL_HALF_SIZE, step: 1, columns: 221, rows: 221 },
    spawn: { ...basePhysics.spawn, position: [RENEWAL_SPAWN[0], spawnY, RENEWAL_SPAWN[1]] as Point3, groundClearance } }
  return { physics, pavilions }
}
