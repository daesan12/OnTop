import { TABLES as legacyTables, TABLE_SEATS, type Vec3 } from '../../src/config'
import { tableSeats, type TableAnchor } from '../../src/park/tablePlacement'
import { STONE_RUMBLE_ANCHOR_ID } from '../../src/game/stone-rumble/entrance'
import { groundSurfaceHeight } from '../groundSurface'
import { facilityYaw } from '../facilityPlacement'
import { PAVILION_TARGETS, STONE_TABLE_TARGETS } from '../mapping/identities'
import { facilityGroundY, heightAt, site, SUB_PAVILION_SCALE, type Point } from '../plan'

const unit = 1.1 * SUB_PAVILION_SCALE

export function buildRenewalTables(): TableAnchor[] {
  const stones = Object.entries(STONE_TABLE_TARGETS).map(([id, [x, z]]) => {
    const y = heightAt(x, z) + .12
    return {
      id, position: [x, y, z] as Vec3, assetId: 'procedural/stone-game-table', spectatorRadius: 3.5,
      seatAnchors: TABLE_SEATS.map(seat => [seat.x, .56, seat.z] as Vec3), seatSurfaceY: .56,
      interactionPoints: [[x, y, z + 2], [x, y, z - 2], [x + 2, y, z], [x - 2, y, z]] as Vec3[],
    }
  })
  const pavilions = legacyTables.flatMap(table => {
    const id = table.pavilionId && PAVILION_TARGETS[table.pavilionId]
    if (!id) return []
    const s = site(id), main = id === 'pavilion'
    const y = main ? facilityGroundY(s) + .115 + 2.6
      : (id === 'island-pavilion' ? 4.2 : heightAt(s.x, s.z)) + .572 * unit
    const yaw = facilityYaw(s), sin = Math.sin(yaw), cos = Math.cos(yaw)
    const rotate = ([x, z]: Point): Point => [cos * x + sin * z, -sin * x + cos * z]
    const seatSurfaceY = main ? .66 : .51 * unit
    const seatDistance = main ? 2.95 : 1.05 * unit
    const seatSide = main ? 2.95 : 1.16 * unit
    const reachDistance = main ? 3.82 : 1.63 * unit
    const front = main ? -seatDistance : seatDistance
    const seats: Point[] = [[0, front], [0, -front], [seatSide, 0], [-seatSide, 0]]
    const reach: Point[] = [[0, reachDistance], [0, -reachDistance], [reachDistance, 0], [-reachDistance, 0]]
    return [{
      ...table, position: [s.x, y, s.z] as Vec3, seatSurfaceY,
      boardScale: main ? 1.8 : 1.35,
      boardOffsetY: main ? .09 : .7925 * unit - 1.06,
      seatAnchors: seats.map(p => { const [x, z] = rotate(p); return [x, seatSurfaceY, z] as Vec3 }),
      interactionPoints: reach.map(p => { const [x, z] = rotate(p); return [s.x + x, y, s.z + z] as Vec3 }),
    }]
  })
  const x = 5, z = -63, y = groundSurfaceHeight(x, z) + .12
  const stoneRumble: TableAnchor = {
    id: STONE_RUMBLE_ANCHOR_ID,
    position: [x, y, z],
    assetId: 'procedural/stone-game-table',
    spectatorRadius: 3.5,
    seatAnchors: tableSeats({}, 8).map(seat => [seat.x, .56, seat.z]),
    seatSurfaceY: .56,
    interactionPoints: [[0, groundSurfaceHeight(0, z), z], [x, y, z + 2]],
  }
  return [...stones, ...pavilions, stoneRumble].sort((a, b) => Number(a.id.slice(6)) - Number(b.id.slice(6)))
}
