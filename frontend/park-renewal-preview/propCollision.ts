import { MOVEMENT } from '../src/config'
import { DRAFT_FOUNTAIN, SITES as originalSites } from '../src/layout-preview/layout'
import { PARK_DATA } from '../src/map/park'
import { facilityYaw } from './facilityPlacement'
import { benches } from './landscape'
import { outdoorStoneTableParts } from './original/features/tables/outdoorStoneTableParts'
import {
  FISHING_BENCHES, FISHING_DECK, JUMP_TABLES, LAKE, REST_PAVILIONS,
  SUB_PAVILION_SCALE, TABLES, facilityGroundY, heightAt, site, type Point,
} from './plan'
import { TOWER_TOP } from './towerFurniturePlan'

type Placement = { x: number; y: number; z: number; yaw: number; scale?: number }
type Shape = { kind: 'circle'; radius: number } | { kind: 'box'; halfX: number; halfZ: number; cos: number; sin: number }
type Blocker = Shape & { x: number; z: number; bottom: number; top: number }
const blockers: Blocker[] = []
export const parkPropBlockers: readonly Blocker[] = blockers

const cell = 4
const bins = new Map<string, Blocker[]>()
const { radius: playerRadius, halfHeight } = MOVEMENT
const playerHeight = 2 * (halfHeight + playerRadius)
export const SPECTATOR_BENCH_HEIGHTS = { main: .7, rest: .583 } as const
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

function subPavilion(p: Placement) {
  octagonalRails(p, 2.827, .04, -.08, .57, [1.06, 0, 0, 0])
  octagonalRails(p, 2.38 * Math.cos(Math.PI / 8), .1, .57, 1.47, [Infinity, 0, 0, 0])
  for (let i = 0; i < 8; i++) {
    const angle = Math.PI / 8 + i * Math.PI / 4
    const column: Point = [2.38 * Math.sin(angle), 2.38 * Math.cos(angle)]
    box(p, column, .46, .46, .57, .83)
    circle(p, column, .165, .83, 3.51)
    if (i === 0) continue // The front face has stairs and no built-in bench.
    const a = i * Math.PI / 4, r = 2.12 * Math.cos(Math.PI / 8)
    box(p, [r * Math.sin(a), r * Math.cos(a)], 1.67, .49, .57, .572 + SPECTATOR_BENCH_HEIGHTS.rest, a)
  }
  for (const x of [-.92, .92]) {
    for (let i = 0; i < 3; i++) box(p, [x, 2.84 + i * .35], .26, .52, .01, .67 - i * .15)
  }
  circle(p, [0, 0], .7, .57, 1.363)
  for (const z of [-1.05, 1.05]) circle(p, [0, z], .28, .57, 1.08)
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
octagonalRails(mainPlacement, 8.684, .25, 2.6, 3.58, [1.62, 1.62, 1.62, 1.62])
octagonalRails(mainPlacement, 5.865, .25, 2.6, 3.65, [1.35, 1.35, 1.35, 1.35])
for (let i = 0; i < 8; i++) {
  const angle = Math.PI / 8 + i * Math.PI / 4
  const column: Point = [6.25 * Math.sin(angle), 6.25 * Math.cos(angle)]
  box(mainPlacement, column, .96, .96, 2.6, 2.82)
  circle(mainPlacement, column, .4, 2.82, 8.72)
  if (i === 4) continue
  const a = i * Math.PI / 4
  box(mainPlacement, [4.97 * Math.sin(a), 4.97 * Math.cos(a)], 4.1, .9, 2.6, 2.6 + SPECTATOR_BENCH_HEIGHTS.main, a)
}
circle(mainPlacement, [0, 0], 2.1, 2.6, 3.77)
for (const z of [-2.95, 2.95]) box(mainPlacement, [0, z], .61, .61, 2.6, 3.26)

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
