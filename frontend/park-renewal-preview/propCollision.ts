import { mainPagodaCollision } from './pagodaCollision'
import { WINTER_DECOR } from '../src/features/winter/plan'
import treeCollision from '../src/features/winter/community/assets/tree-collision.json'
import { GARDEN_PAGODA, MOVEMENT, PAGODA_TIERS } from '../src/config'
import { DRAFT_FITNESS_STATIONS, DRAFT_FOUNTAIN, SITES as originalSites } from '../src/layout-preview/layout'
import { PARK_DATA } from '../src/map/park'
import { ARCADE_SCALE } from './assetSizing'
import { VR_SKEWER_HALL } from './approved/vr-skewer-hall-20261107-v1/core/frontend/src/features/skewer/parkAsset/vrSkewerHallGeometry'
import { facilityBase, facilityYaw } from './facilityPlacement'
import { benches } from './landscape'
import { outdoorStoneTableParts } from './original/features/tables/outdoorStoneTableParts'
import {
  BALLOON_SCALE, FISHING_BENCHES, FISHING_DECK, FISHING_NOTICE, FISHING_ROD_RACKS, FISHING_SHOP, JUMP_TABLES, LAKE,
  RENTAL_PAIR_SPACING, RENTAL_VEHICLE_X, REST_PAVILIONS, SITES, STATION_BENCH, STATION_SCALE,
  SUB_PAVILION_SCALE, TABLES, facilityGroundY, heightAt, site, type Point,
} from './plan'
import { TOWER_TOP } from './towerFurniturePlan'
import { REST_FURNITURE_VERTICAL_SCALE, pavilionBenchSegments } from './pavilionBenchLayout'

type Placement = { x: number; y: number; z: number; yaw: number; scale?: number }
type Shape = { kind: 'circle'; radius: number } | { kind: 'box'; halfX: number; halfZ: number; cos: number; sin: number }
type Blocker = Shape & { x: number; z: number; bottom: number; top: number; previewOnly?: boolean }
const blockers: Blocker[] = []
const furnitureHeight = PARK_DATA.physics.furniturePolicy.movementHeight
export const parkPropBlockers: readonly Blocker[] = blockers

const cell = 4
const bins = new Map<string, Blocker[]>()
const { radius: playerRadius, halfHeight } = MOVEMENT
const playerHeight = 2 * (halfHeight + playerRadius)
const binKey = (x: number, z: number) => `${x},${z}`

function register(blocker: Blocker) {
  blockers.push(blocker)
  const { x, z } = blocker
  const [rx, rz] = blocker.kind === 'circle' ? [blocker.radius, blocker.radius] : [
    blocker.halfX * Math.abs(blocker.cos) + blocker.halfZ * Math.abs(blocker.sin),
    blocker.halfX * Math.abs(blocker.sin) + blocker.halfZ * Math.abs(blocker.cos),
  ]
  for (let i = Math.floor((x - rx - playerRadius) / cell); i <= Math.floor((x + rx + playerRadius) / cell); i++) {
    for (let j = Math.floor((z - rz - playerRadius) / cell); j <= Math.floor((z + rz + playerRadius) / cell); j++) {
      const key = binKey(i, j)
      const list = bins.get(key)
      if (list) list.push(blocker)
      else bins.set(key, [blocker])
    }
  }
}

function position(p: Placement, [x, z]: Point, bottom: number, top: number) {
  const scale = p.scale ?? 1, cos = Math.cos(p.yaw), sin = Math.sin(p.yaw)
  return { x: p.x + (cos * x + sin * z) * scale, z: p.z + (-sin * x + cos * z) * scale,
    bottom: p.y + bottom * scale, top: p.y + top * scale }
}

function box(p: Placement, center: Point, width: number, depth: number, bottom: number, top: number, yaw = 0) {
  const scale = p.scale ?? 1, angle = p.yaw + yaw
  register({ ...position(p, center, bottom, top), kind: 'box', halfX: width * scale / 2,
    halfZ: depth * scale / 2, cos: Math.cos(angle), sin: Math.sin(angle) })
}

function circle(p: Placement, center: Point, radius: number, bottom: number, top: number) {
  register({ ...position(p, center, bottom, top), kind: 'circle', radius: radius * (p.scale ?? 1) })
}

function rail(p: Placement, a: Point, b: Point, depth: number, bottom: number, top: number) {
  const dx = b[0] - a[0], dz = b[1] - a[1]
  box(p, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], Math.hypot(dx, dz), depth, bottom, top, Math.atan2(-dz, dx))
}

function octagonalRails(
  p: Placement, apothem: number, depth: number, bottom: number, top: number,
  openings: readonly [number, number, number, number],
) {
  const corner = apothem * Math.tan(Math.PI / 8)
  for (let side = 0; side < 4; side++) {
    const angle = side * Math.PI / 2, cos = Math.cos(angle), sin = Math.sin(angle)
    const edge = (x: number, z: number): Point => [cos * x + sin * z, -sin * x + cos * z]
    const opening = openings[side]!
    if (opening === 0) rail(p, edge(-corner, apothem), edge(corner, apothem), depth, bottom, top)
    else if (opening < corner) {
      rail(p, edge(-corner, apothem), edge(-opening, apothem), depth, bottom, top)
      rail(p, edge(opening, apothem), edge(corner, apothem), depth, bottom, top)
    }
    rail(p, edge(corner, apothem), edge(apothem, corner), depth, bottom, top)
  }
}

function bench(p: Placement, horizontalScale = 1, seatHeight = .58) {
  const verticalScale = seatHeight / .58
  box(p, [0, 0], 2.8 * horizontalScale, .81 * horizontalScale, .48 * verticalScale, seatHeight)
  box(p, [0, -.36 * horizontalScale], 2.8 * horizontalScale, .13 * horizontalScale, .8 * verticalScale, 1.27 * verticalScale)
  for (const x of [-1.17, 1.17]) {
    box(p, [x * horizontalScale, 0], .23 * horizontalScale, .9 * horizontalScale, 0, .48 * verticalScale)
  }
}

for (const { point: [x, z], yaw } of benches) bench({ x, y: heightAt(x, z) + .12, z, yaw })
const fountain = site('fountain')
for (const b of PARK_DATA.interactions.benches.filter(b => b.siteId.startsWith('bench-fountain-'))) {
  const [x, y, z] = b.position
  bench({ x: x + fountain.x - originalSites.fountain.x, y: y + heightAt(fountain.x, fountain.z),
    z: z + fountain.z - originalSites.fountain.z, yaw: b.yaw },
    DRAFT_FOUNTAIN.scale, .56)
}
const tower = site('tower')
for (const [x, z] of TOWER_TOP.benches) {
  bench({ x: tower.x + x, y: facilityGroundY(tower) + TOWER_TOP.floor + .015, z: tower.z + z,
    yaw: Math.atan2(-x, -z) }, 1, .56)
}
for (const [x, z, yaw] of FISHING_BENCHES) {
  const p = { x, y: FISHING_DECK.top, z, yaw }
  box(p, [0, 0], 1.58, .66, .27, .55)
  for (const side of [-1, 1]) box(p, [side * .62, 0], .1, .52, 0, .48)
}
const gym = site('fitness')
const gymPlacement = { x: gym.x, y: heightAt(gym.x, gym.z), z: gym.z, yaw: 0 }
for (let quadrant = 0; quadrant < 4; quadrant++) {
  const arc = (Math.PI / 2 - .4) / 12
  for (let i = 0; i < 12; i++) {
    const angle = quadrant * Math.PI / 2 + .2 + (i + .5) * arc
    box(gymPlacement, [2.98 * Math.cos(angle), -2.98 * Math.sin(angle)], .76, 3.36 * arc,
      .415, .62, angle)
  }
}

const stoneTable = outdoorStoneTableParts(2)
for (const [x, z] of [...TABLES, ...JUMP_TABLES]) {
  const p = { x, y: heightAt(x, z) + .12, z, yaw: 0 }
  for (const { p: [px, py, pz], s: [sx, sy, sz] } of [...stoneTable.stone, ...stoneTable.supports]) {
    box(p, [px, pz], sx, sz, py - sy / 2, py + sy / 2)
  }
}

const restBenchSegments = pavilionBenchSegments('rest')
function subPavilion(p: Placement) {
  octagonalRails(p, 2.827, .04, -.08, .57, [1.06, 0, 0, 0])
  octagonalRails(p, 2.38 * Math.cos(Math.PI / 8), .22, .44, 1.58, [Infinity, 0, 0, 0])
  for (let i = 0; i < 8; i++) {
    const angle = Math.PI / 8 + i * Math.PI / 4
    const column: Point = [2.38 * Math.sin(angle), 2.38 * Math.cos(angle)]
    box(p, column, .46, .46, .57, .83)
    circle(p, column, .165, .83, 3.51)
    const b = restBenchSegments.find(segment => segment.side === i)
    if (b) box(p, [b.x, b.z], b.width, b.depth, .57, b.floor + b.seatHeight * REST_FURNITURE_VERTICAL_SCALE, b.yaw)
  }
  for (const x of [-.92, .92]) {
    // The three moulded stone sides form one continuous stair edge.
    for (let i = 0; i < 3; i++) box(p, [x, 2.84 + i * .35], .26, .52, -.09, .67 - i * .15)
  }
  circle(p, [0, 0], .7, .57, .57 + furnitureHeight / p.scale!)
  for (const z of [-1.05, 1.05]) circle(p, [0, z], .28, .57, .57 + furnitureHeight / p.scale!)
}

const subScale = 1.1 * SUB_PAVILION_SCALE
REST_PAVILIONS.forEach(([x, z], index) => subPavilion({
  x, y: heightAt(x, z), z, yaw: facilityYaw(site('rest-' + (index + 1))), scale: subScale,
}))
subPavilion({ x: LAKE.island.x, y: 4.2, z: LAKE.island.z, yaw: facilityYaw(site('island-pavilion')), scale: subScale })

const main = site('pavilion')
// Main GLB coordinates before the render wrapper lifts its -0.015 m base to grade.
const mainPlacement = { x: main.x, y: facilityGroundY(main) + .115, z: main.z, yaw: facilityYaw(main) }
octagonalRails(mainPlacement, 9.812, .06, -.08, 1.3, [2.2, 2.2, 2.2, 2.2])
octagonalRails(mainPlacement, 8.684, .1, 1.3, 2.6, [2.2, 2.2, 2.2, 2.2])
// The rail ends line up with the four stair cheeks, including the wider south flight.
octagonalRails(mainPlacement, 8.684, .25, 2.48, 3.7, [1.49, 1.49, 2.18, 1.49])
octagonalRails(mainPlacement, 5.865, .25, 2.6, 3.65, [1.35, 1.35, 1.35, 1.35])
const mainBenchSegments = pavilionBenchSegments('main')
for (let i = 0; i < 8; i++) {
  const angle = Math.PI / 8 + i * Math.PI / 4
  const column: Point = [6.25 * Math.sin(angle), 6.25 * Math.cos(angle)]
  box(mainPlacement, column, .96, .96, 2.6, 2.82)
  circle(mainPlacement, column, .4, 2.82, 8.72)
  const b = mainBenchSegments.find(segment => segment.side === i)
  if (b) box(mainPlacement, [b.x, b.z], b.width, b.depth, b.floor, b.floor + b.seatHeight, b.yaw)
}
circle(mainPlacement, [0, 0], 2.1, 2.6, 2.6 + furnitureHeight)
for (const z of [-2.95, 2.95]) box(mainPlacement, [0, z], .61, .61, 2.6, 2.6 + furnitureHeight)

function atSite(id: string): Placement {
  const s = site(id)
  return { x: s.x, y: facilityBase(id), z: s.z, yaw: facilityYaw(s) }
}

// Use the body, not the roof eaves or the entire graded site, for closed stalls.
const stalls = [
  ['fortune', 4.1, 2.65, 2.65], ['lottery', 3.8, 2.65, 2.7],
  ['mole', 10.8, 6.8, 4.1], ['gacha', 3.5, 3.45, 4.65],
  ['bread', 8.5, 5.6, 3.25], ['pigeon', 8.5, 5.6, 3.5], ['cafe', 8.5, 5.6, 3.5],
] as const
for (const [id, width, depth, high] of stalls) box(atSite(id), [0, 0], width, depth, -.18, high)
box(atSite('stele'), [0, 0], 1.65, .94, -.2, 2.15)
const mailbox = atSite('mailbox')
box(mailbox, [0, 0], 1.65, 1.1, -.18, 3.15)
const ranking = atSite('ranking')
box(ranking, [0, 0], 7.4, .56, .18, 4.35)
for (const x of [-3.5, 3.5]) box(ranking, [x, 0], .45, .88, -.18, .55)
const tackleShop = { ...FISHING_SHOP, y: FISHING_SHOP.y + .1 }
box(tackleShop, [0, 0], 3.3 * 1.8, 2.28 * 1.8, -.16, .38 * 1.35)
box(tackleShop, [0, .09], 3.0 * 1.8, 2.21 * 1.8, .30, 2.78 * 1.35)
box({ ...FISHING_NOTICE, y: heightAt(FISHING_NOTICE.x, FISHING_NOTICE.z) + .1 },
  [0, .02], 2.38, .31, -.12, 2.22)
for (const [x, z] of FISHING_ROD_RACKS) box({ x, z, y: FISHING_DECK.top, yaw: -Math.PI / 2 }, [0, 0], 1.55, .58, 0, 1)

function walls(p: Placement, width: number, depth: number, height: number, door: number, thickness: number) {
  const side = (width - door) / 2
  box(p, [0, -depth / 2], width + thickness, thickness, -.22, height)
  for (const sign of [-1, 1]) {
    box(p, [sign * width / 2, 0], thickness, depth + thickness, -.22, height)
    box(p, [sign * (door / 2 + side / 2), depth / 2], side + thickness / 2, thickness, -.22, height)
  }
}
const arcade = atSite('arcade')
walls(arcade, 18 * ARCADE_SCALE[0], 12 * ARCADE_SCALE[2], 6.4 * ARCADE_SCALE[1], 4.6 * ARCADE_SCALE[0], .22)
for (const x of [-6, -2]) box(arcade, [x * ARCADE_SCALE[0], -3.6 * ARCADE_SCALE[2]], .92, .67, .07, 2)
const vr = atSite('vr')
walls(vr, VR_SKEWER_HALL.width, VR_SKEWER_HALL.depth, VR_SKEWER_HALL.height, VR_SKEWER_HALL.doorWidth, .2)
for (const x of VR_SKEWER_HALL.stations) box(vr, [x, -2.85], 1.8, 1.15, .06, 1.65)
circle(vr, [-4.5, 5.4], .8, -.1, 1.15)
// Open-front structures retain their approach and floor.
for (const id of ['folk', 'shooting']) {
  const p = atSite(id)
  // Both art pieces are currently scenery; block running through the open display bays.
  box(p, [0, 0], 9.3, 5.8, -.3, id === 'shooting' ? 3.1 : 2.8)
}
const shooting = atSite('shooting')
for (let step = 0; step < 3; step++) {
  const top = (3-step) * .216
  const z = 2.98 + step * .38
  box(shooting, [0,z], 3.28, .54, -.18, top)
  for (const side of [-1,1]) box(shooting, [side * 1.82,z+.02], .32, .56, -.18, top+.26)
}
for (const station of DRAFT_FITNESS_STATIONS) {
  const [x, y, z] = station.position
  box({ x: x + gym.x - originalSites.fitness.x, y: gymPlacement.y + y, z: z + gym.z - originalSites.fitness.z,
    yaw: station.yaw }, [0, 0], 1.68, 1.29, -.16, 1.95)
}
for (const s of SITES.filter(s => s.asset === 'pair')) {
  const p = atSite(s.id)
  for (const side of [-1, 1]) {
    const dx = side * RENTAL_PAIR_SPACING / 2
    for (const x of [-1.38, 1.38]) box(p, [dx + x, .66], .24, .24, -.16, 2.05)
    for (const x of RENTAL_VEHICLE_X) {
      box(p, [dx + x, side < 0 ? -.29 : -.06], side < 0 ? .52 : .4, side < 0 ? 1.76 : 1.31, .06, 1.31)
    }
  }
}
const stationSite = site('balloon')
const station = { x: stationSite.x, y: heightAt(stationSite.x, stationSite.z), z: stationSite.z, yaw: 0 }
const stationFloor = .65 * STATION_SCALE
bench({ x: station.x + STATION_BENCH.x, y: station.y + STATION_BENCH.floor,
  z: station.z + STATION_BENCH.z, yaw: 0 }, 1, STATION_BENCH.seatHeight)
circle(station, [0, 0], 5.95 * 1.6 * STATION_SCALE, -.25, stationFloor)
const stationRailPoint = (a: number): Point => [Math.sin(a) * 5.73 * 1.6 * STATION_SCALE, Math.cos(a) * 5.73 * 1.6 * STATION_SCALE]
for (let i = 0; i < 28; i++) {
  const angle = (n: number) => .31 + n * (Math.PI * 2 - .62) / 28
  rail(station, stationRailPoint(angle(i)), stationRailPoint(angle(i + 1)), .24, stationFloor, stationFloor + 1.24 * STATION_SCALE)
}
for (const x of [-2.125, 2.125]) for (const z of [-1.35, 1.35]) {
  circle(station, [(x - 2.15) * 1.6 * STATION_SCALE, (z - 1.7) * 1.6 * STATION_SCALE], .23 * STATION_SCALE,
    stationFloor, stationFloor + 2.8 * STATION_SCALE)
}
const shelterScale = 1.6 * STATION_SCALE
for (const x of [-4.275, -.025]) {
  rail(station, [x * shelterScale, -2.97 * shelterScale], [x * shelterScale, -.65 * shelterScale],
    .30, stationFloor, stationFloor + 2.55 * STATION_SCALE)
}
rail(station, [-4.275 * shelterScale, -2.97 * shelterScale], [-.025 * shelterScale, -2.97 * shelterScale],
  .30, stationFloor, stationFloor + 2.55 * STATION_SCALE)
const basket = { ...station, x: station.x + 2.35 * 1.6 * STATION_SCALE,
  y: station.y + stationFloor - .37 * BALLOON_SCALE + .12, scale: BALLOON_SCALE }
circle(basket, [0, 0], 1.87, .04, .38)
for (let i = 0; i < 20; i++) {
  const edge = (n: number): Point => [1.81 * Math.sin(n * Math.PI / 10), 1.81 * Math.cos(n * Math.PI / 10)]
  rail(basket, edge(i), edge(i + 1), .15, .32, 1.57)
}
for (const d of WINTER_DECOR) {
  const y = heightAt(d.x, d.z) + .085
  register({ kind: 'circle', x: d.x, z: d.z, radius: d.kind === 'tree' ? treeCollision.tree.radius : d.radius,
    bottom: y - .1, top: y + d.height, ...(d.kind === 'tree' ? { previewOnly: true } : {}) })
}
// 단독 보행 프리뷰는 2D 포락선을 사용하고 실제 서비스는 정확한 볼록체를 사용한다.
const mainSite = site('pagoda'), mainSolid = mainPagodaCollision(mainSite.x, heightAt(mainSite.x, mainSite.z), mainSite.z)
for (const b of mainSolid.boxes) register({ kind: 'box', x: b.center[0], z: b.center[2],
  halfX: b.half[0], halfZ: b.half[2], cos: 1, sin: 0, bottom: b.center[1] - b.half[1], top: b.center[1] + b.half[1], previewOnly: true })
for (const h of mainSolid.hulls) {
  const xs = h.vertices.filter((_, i) => i % 3 === 0), ys = h.vertices.filter((_, i) => i % 3 === 1), zs = h.vertices.filter((_, i) => i % 3 === 2)
  register({ kind: 'box', x: (Math.min(...xs) + Math.max(...xs)) / 2, z: (Math.min(...zs) + Math.max(...zs)) / 2,
    halfX: (Math.max(...xs) - Math.min(...xs)) / 2, halfZ: (Math.max(...zs) - Math.min(...zs)) / 2,
    cos: 1, sin: 0, bottom: Math.min(...ys), top: Math.max(...ys), previewOnly: true })
}
const jumpSite = site('jump')
const jumpBase = { x: jumpSite.x, y: heightAt(jumpSite.x, jumpSite.z), z: jumpSite.z, yaw: 0, scale: .8 }
const jumpWidth = GARDEN_PAGODA.widthScale
// Match the stepped profiles. The outer lip is only .24 m high in model space.
for (const [width, bottom, top] of [[7.4, -.12, .24], [6, .24, .76], [5.55, .76, 1.47], [5.3, 1.47, 1.92], [4.85, 1.92, 2.6]] as const) {
  box(jumpBase, [0, 0], width * 1.15 * jumpWidth, width * 1.15 * jumpWidth, bottom, top)
}
for (const tier of PAGODA_TIERS) {
  const width = tier.width * jumpWidth * .69
  const depth = tier.cross ? width * .55 : width
  box(jumpBase, [0, 0], width, depth, tier.y, tier.y + tier.bodyHeight)
  if (tier.cross) box(jumpBase, [0, 0], depth, width, tier.y, tier.y + tier.bodyHeight)
}

export function hitsParkProp(x: number, z: number, foot: number) {
  const nearby = bins.get(binKey(Math.floor(x / cell), Math.floor(z / cell)))
  if (!nearby) return false
  for (const obstacle of nearby) {
    if (foot >= obstacle.top - .008 || foot + playerHeight <= obstacle.bottom + .008) continue
    const dx = x - obstacle.x, dz = z - obstacle.z
    if (obstacle.kind === 'circle') {
      if (Math.hypot(dx, dz) < obstacle.radius + playerRadius) return true
    } else {
      const side = Math.max(0, Math.abs(dx * obstacle.cos - dz * obstacle.sin) - obstacle.halfX)
      const depth = Math.max(0, Math.abs(dx * obstacle.sin + dz * obstacle.cos) - obstacle.halfZ)
      if (Math.hypot(side, depth) < playerRadius) return true
    }
  }
  return false
}
