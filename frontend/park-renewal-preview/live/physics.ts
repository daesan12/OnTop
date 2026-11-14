import { ShapeUtils, Vector2, type BufferGeometry } from 'three'
import { createTowerDeck, createTowerRamp, MOVEMENT, OBSERVATION_TOWER, TOWER_DECK_RAIL_SEGMENTS, towerPoint } from '../../src/config'
import { tableSeats, type TableAnchor } from '../../src/park/tablePlacement'
import { PARK_DATA } from '../../src/map/park'
import type { PhysicalBox, PhysicalHull, PhysicalMesh } from '../../src/map/park/physics'
import type { Point3 } from '../../src/map/park/interactionData'
import { BOUNDARY_LENGTH, GATE, boundaryAtDistance, WALL_RUNS } from '../boundaryPlan'
import { fountainAccessHeight } from '../fountainAccessSurface'
import { parkGround } from '../groundGeometry'
import { groundSurfaceHeight } from '../groundSurface'
import { HILLSIDE_RAIL_HEIGHTS, MONUMENT_STAIR_RAIL } from '../guardDimensions'
import { hillsideGuardRuns, ascentFenceRuns } from '../guardLayout'
import { bridgeApproachGuards, lakeFenceSegments } from '../lakePlan'
import { fitnessFenceSegments } from '../motionPlan'
import {
  BRIDGE, BRIDGE_LANDINGS, DOCK_ACCESS, FISHING_ACCESS, FISHING_OUTLINE, FISHING_DECK, FISHING_UPPER, FISHING_STAIRS,
  LAKE, MONUMENT_STAIRS, REST_PAVILIONS, STATION_APPROACH, STATION_STAIRS, SUB_PAVILION_SCALE,
  accessTopAt, bridgeDeckHeight, bridgeLandingHeight, facilityGroundY, fishingRailSections, heightAt, inLake, site, type Point,
} from '../plan'
import { parkPropBlockers } from '../propCollision'
import { SPECTATOR_BENCH_HEIGHTS } from '../pavilionBenchLayout'
import { createTowerEntrance, towerRampStartY } from '../towerEntrance'
import { HORROR, HORROR_CRYPT, HORROR_PORTALS, HORROR_SOLIDS } from '../horrorPlan'
import { horrorShell } from '../horrorGeometry'
import { annex, annexVolumes, galleryVolumes, interiorAccess, passageVolumes, upperArrival, upperRamp, upperRoomVolumes } from '../interiorAccess'

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
      if (underStair || HORROR_PORTALS.some(p => x === p.x + (p.outward > 0 ? 1 : 0)
        && z > p.z - p.width / 2 && z - 1 < p.z + p.width / 2)) {
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
  const rail = (id: string, a: Point3, b: Point3, thickness: number, height: number) => {
    const dx = b[0] - a[0], dz = b[2] - a[2], length = Math.hypot(dx, dz)
    if (length < .01) return
    putBox(id, [(a[0] + b[0]) / 2, (a[1] + b[1] + height) / 2, (a[2] + b[2]) / 2],
      [length / 2 + .015, height / 2, thickness / 2], Math.atan2(-dz, dx))
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
  const deck = (id: string, x: number, z: number, radius: number, y: number, yaw = 0) =>
    floor(id, Array.from({ length: 8 }, (_, i) => {
      const angle = (i + .5) * Math.PI / 4
      return transform([radius * Math.sin(angle), radius * Math.cos(angle)], x, z, yaw)
    }), () => y)
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
  fromGeometry('summit-retaining-wall', parkGround.retaining, 'solid')
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
    ['hill-rail', hillsideGuardRuns, HILLSIDE_RAIL_HEIGHTS[1] + .05], ['ascent-rail', ascentFenceRuns, 1.1],
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
  parkPropBlockers.forEach((b, i) => {
    const id = 'park-prop-' + i
    if (b.kind === 'circle') cylinder(id, b.x, b.z, b.radius, b.bottom, b.top)
    else putBox(id, [b.x, (b.bottom + b.top) / 2, b.z], [b.halfX, (b.top - b.bottom) / 2, b.halfZ], Math.atan2(b.sin, b.cos))
  })
  // The authored proxies above retain the visible bench/seat profiles. Service table
  // columns keep the existing no-climb policy and two visible stone seats.
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
  deck('main-pavilion-lower-terrace', main.x, main.z, 9.812 / Math.cos(Math.PI / 8), mainBase + 1.3)
  for (let i = 0; i < 4; i++) {
    const yaw = i * Math.PI / 2, width = i === 0 ? 4.37 : 2.97
    ramp('main-pavilion-landing-' + i, main.x, main.z, width, 8.65, 9.026, mainBase + 2.6, mainBase + 2.6, yaw)
    ramp('main-pavilion-stairs-' + i, main.x, main.z, width, 9.026, 13.606, mainBase + 2.6, mainBase, yaw)
  }
  const mainFloor = mainBase + 2.6
  const pavilions = [{ id: 'P0', x: main.x, z: main.z, floor: mainFloor, scale: 2,
    spectatorBenchTop: mainFloor + SPECTATOR_BENCH_HEIGHTS.main }]
  for (const [i, [x, z]] of [...REST_PAVILIONS, [LAKE.island.x, LAKE.island.z] as Point].entries()) {
    const island = i === REST_PAVILIONS.length
    const yaw = island ? -Math.PI / 2 : site('rest-' + (i + 1)).yaw!
    const base = island ? 4.2 : heightAt(x, z), top = base + .572 * subScale
    deck('rest-pavilion-floor-' + i, x, z, 2.97 * subScale, top, yaw)
    ramp('rest-pavilion-stairs-' + i, x, z, 1.52 * subScale, 2.67 * subScale, 3.77 * subScale, top, base + .085, yaw)
    pavilions.push({ id: ['P1', 'P3', 'P4', 'P2', 'P5'][i]!, x, z, floor: top, scale: subScale / 1.52,
      spectatorBenchTop: top + SPECTATOR_BENCH_HEIGHTS.rest * subScale })
  }
  const pagoda = site('pagoda'), pg = heightAt(pagoda.x, pagoda.z)
  ramp('pagoda-terrace', pagoda.x, pagoda.z, 26, -13, 13, pg + 1.8, pg + 1.8)
  for (let i = 0; i < 4; i++) ramp('pagoda-stairs-' + i, pagoda.x, pagoda.z, 6, 13, 17, pg + 1.8, pg + .085, i * Math.PI / 2)
  ramp('monument-stairs', monument.x, 0, monument.width, monument.zTop, monument.zBottom, monument.top + .085, monument.bottom + .085)
  const stairRail = MONUMENT_STAIR_RAIL
  for (const side of [-1, 1]) for (let i = 0; i < monument.steps; i++) {
    const x = monument.x + side * (monument.width / 2 + stairRail.sideOffset)
    const at = (n: number): Point3 => [x, monument.top + (monument.bottom - monument.top) * n / monument.steps,
      monument.zTop + (monument.zBottom - monument.zTop) * n / monument.steps]
    rail('monument-rail-' + side + '-' + i, at(i), at(i + 1), stairRail.postWidth, stairRail.height)
  }
  const station = site('balloon'), by = heightAt(station.x, station.z)
  const balloonScale = 1.7
  ramp('balloon-boarding-floor', station.x, station.z, 18, -10, STATION_STAIRS.zTop, by + STATION_STAIRS.top, by + STATION_STAIRS.top)
  ramp('balloon-boarding-stairs', station.x, station.z, STATION_STAIRS.width, STATION_STAIRS.zTop, STATION_STAIRS.zBottom,
    by + .65 * balloonScale, groundSurfaceHeight(...STATION_APPROACH.b))

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
      const bend = access === DOCK_ACCESS ? access.width / 2 : 0
      if (i === 1 && bend) {
        ramp('dock-access-incline', ...a, access.width, 0, length - bend, accessTopAt(access, ...a), access.top, yaw)
        ramp('dock-access-landing', ...a, access.width, length - bend, length + bend, access.top, access.top, yaw)
      } else ramp(name + '-access-' + i, ...a, access.width, i > 1 ? -bend : 0, length, accessTopAt(access, ...a), accessTopAt(access, ...b), yaw)
    }
  }
  const dock = site('dock')
  ramp('duck-dock-rear-deck', dock.x, dock.z, 10.9, 1.21875, 3.03125, DOCK_ACCESS.top, DOCK_ACCESS.top)
  floor('fishing-deck', FISHING_OUTLINE, () => FISHING_DECK.top)
  floor('fishing-upper-deck', FISHING_UPPER.outline, () => FISHING_UPPER.top)
  ramp('fishing-stairs', FISHING_STAIRS.x, 0, FISHING_STAIRS.width, FISHING_STAIRS.zTop, FISHING_STAIRS.zBottom,
    FISHING_STAIRS.top, FISHING_STAIRS.bottom)
  fishingRailSections().forEach((r, i) => rail('fishing-rail-' + i, [r.a[0], r.floor, r.a[1]], [r.b[0], r.endFloor, r.b[1]], .13, 1.12))

  const towerScale = 40 / OBSERVATION_TOWER.height, towerBase = heightAt(tower.x, tower.z)
  const towerWorld = ([x, y, z]: Point3): Point3 => [tower.x - x + OBSERVATION_TOWER.x, towerBase + y * towerScale, tower.z - z + OBSERVATION_TOWER.z]
  for (const [id, create] of [['tower-ramp', createTowerRamp], ['tower-deck', createTowerDeck]] as const) {
    const m = create(), vertices: number[] = []
    for (let i = 0; i < m.vertices.length; i += 3) vertices.push(...towerWorld([m.vertices[i]!, m.vertices[i + 1]!, m.vertices[i + 2]!]))
    meshes.push({ id, role: 'surface', vertices, indices: Array.from(m.indices) })
  }
  fromGeometry('tower-entrance', createTowerEntrance(), 'surface')
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
    secretTerrainCuts,
    interiorAccess: { routes: interiorAccess, annex, upperArrival },
    tower: { ...basePhysics.tower, x: tower.x, z: tower.z, height: 40, topY: towerRampStartY + 40, surfaceOffset: towerRampStartY },
    terrain: { ...basePhysics.terrain, halfSize: RENEWAL_HALF_SIZE, step: 1, columns: 221, rows: 221 },
    spawn: { ...basePhysics.spawn, position: [RENEWAL_SPAWN[0], spawnY, RENEWAL_SPAWN[1]] as Point3, groundClearance } }
  return { physics, pavilions }
}
