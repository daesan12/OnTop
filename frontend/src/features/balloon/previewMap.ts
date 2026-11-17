import RAPIER from '@dimforge/rapier3d-compat'
import { preparePredictionEngine } from '../../network/predictionEngine'
import { addGeneratedPredictionColliders } from '../../network/predictionMap'
import { renewalGroundHeight, renewalMap } from '../../park/renewalMap'
import { BALLOON_DOCK_OFFSET, BALLOON_SCALE, insidePark, inLake, LAKE, STATION_STAIRS } from '../../../park-renewal-preview/plan'
import type { FlightMap, Point } from './flight'

const data = renewalMap?.data
const station = data?.interactions.construction.find(site => site.id === 'balloon')
if (!data || !station) throw new Error('220m 공원의 열기구 승강장 정보를 찾을 수 없습니다.')

export const stationAnchor = station
const [stationX, , stationZ] = station.position
const [reachX, reachY, reachZ] = station.reachPosition
const deckHeight = reachY - .8
export const stationExit = { x: reachX, y: deckHeight, z: reachZ }
export const startPoint = { x: reachX, y: deckHeight, z: stationZ + STATION_STAIRS.zBottom + 1 }
export const balloonScale = BALLOON_SCALE

await preparePredictionEngine()
const world = new RAPIER.World({ x: 0, y: 0, z: 0 })
addGeneratedPredictionColliders(world, data.physics)
world.step()
const mapHalf = data.world.half

function surface(x: number, z: number, from = 100) {
  const hit = world.castRayAndGetNormal(new RAPIER.Ray({ x, y: from, z }, { x: 0, y: -1, z: 0 }), 150, true)
  return hit ? { y: from - hit.timeOfImpact, normal: hit.normal.y } : { y: renewalGroundHeight(x, z), normal: 1 }
}

startPoint.y = surface(startPoint.x, startPoint.z, deckHeight + .5).y

export function canBoard(position: Point) {
  return Math.hypot(position.x - reachX, position.z - reachZ) <= stationAnchor.radius
    && Math.abs(position.y - deckHeight) <= stationAnchor.heightTolerance
}

export function moveWalker(walker: Point, dx: number, dz: number): Point {
  const x = walker.x + dx, z = walker.z + dz
  if (!insidePark(x, z, 1) || inLake(x, z)) return walker
  const next = surface(x, z, walker.y + .46)
  if (next.normal < .55 || Math.abs(next.y - walker.y) > .46) return walker
  return { x, y: next.y, z }
}

function insideFlight(x: number, z: number, margin: number) {
  return Math.max(Math.abs(x), Math.abs(z)) <= mapHalf - margin && insidePark(x, z, margin)
}

const offsets = [[0, 0], [2.75, 0], [-2.75, 0], [0, 2.75], [0, -2.75]] as const

function safeGround(x: number, z: number, y: number) {
  return insideFlight(x, z, 1) && !inLake(x, z, .45) && offsets.every(([dx, dz]) => {
    const px = x + dx, pz = z + dz
    const ground = surface(px, pz)
    return !inLake(px, pz, .45) && ground.normal > .86 && Math.abs(ground.y - y) <= .6
      && Math.abs(ground.y - renewalGroundHeight(px, pz)) <= .55
  })
}

export const flightMap: FlightMap = {
  dock: { x: stationX + BALLOON_DOCK_OFFSET[0], y: deckHeight - STATION_STAIRS.top + BALLOON_DOCK_OFFSET[1], z: stationZ + BALLOON_DOCK_OFFSET[2] },
  dockExit: stationExit,
  inside: insideFlight,
  floor: (x, z) => Math.max(...offsets.map(([dx, dz]) => {
    const px = x + dx, pz = z + dz
    const y = surface(px, pz).y
    return inLake(px, pz) ? Math.max(y, LAKE.y) : y
  })),
  landing(x, z) {
    const y = surface(x, z).y
    if (!safeGround(x, z, y)) return null
    for (const [dx, dz] of [[4, 0], [-4, 0], [0, 4], [0, -4]]) {
      const exitX = x + dx!, exitZ = z + dz!
      const exitY = surface(exitX, exitZ).y
      if (Math.abs(exitY - y) <= .6 && safeGround(exitX, exitZ, exitY)) {
        return { position: { x, y, z }, exit: { x: exitX, y: exitY, z: exitZ } }
      }
    }
    return null
  },
}
