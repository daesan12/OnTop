import { TABLE_SEATS } from '../../src/config'
import { SITES as originalSites } from '../../src/layout-preview/layout'
import { PARK_DATA } from '../../src/map/park'
import type { MapPose, Point3 } from '../../src/map/park/interactionData'
import { facilityYaw } from '../facilityPlacement'
import { FACILITY_TARGETS, STONE_TABLE_TARGETS } from '../mapping/identities'
import { LAKE, heightAt, facilityGroundY, site } from '../plan'
import { TOWER_TOP, telescopeYaw } from '../towerFurniturePlan'
import { buildRenewalPhysics, RENEWAL_HALF_SIZE, RENEWAL_SPAWN } from './physics'

function offset(position: Point3, x: number, y: number, z: number): Point3 {
  return [position[0] + x, position[1] + y, position[2] + z]
}

function shift(pose: MapPose, x: number, y: number, z: number): MapPose {
  return { x: pose.x + x, y: pose.y + y, z: pose.z + z, yaw: pose.yaw }
}

export function buildRenewalMapData() {
  const { physics, pavilions } = buildRenewalPhysics()
  const tables = Object.entries(STONE_TABLE_TARGETS).map(([id, [x, z]]) => ({
    id,
    position: [x, heightAt(x, z) + .12, z] as Point3,
    assetId: 'procedural/stone-game-table',
    seatAnchors: TABLE_SEATS.map(seat => [seat.x, .56, seat.z] as Point3),
  }))
  const facilities = PARK_DATA.facilities.flatMap(facility => {
    const id = FACILITY_TARGETS[facility.id]
    if (!id) return []
    const s = site(id)
    return [{ ...facility, position: [s.x, heightAt(s.x, s.z), s.z] as Point3, yaw: facilityYaw(s) }]
  })
  const fountain = site('fountain'), gym = site('fitness'), tower = site('tower'), mailbox = site('mailbox')
  const fx = fountain.x - originalSites.fountain.x, fy = heightAt(fountain.x, fountain.z), fz = fountain.z - originalSites.fountain.z
  const gx = gym.x - originalSites.fitness.x, gy = heightAt(gym.x, gym.z), gz = gym.z - originalSites.fitness.z
  const deckY = facilityGroundY(tower) + TOWER_TOP.floor + .015
  const old = PARK_DATA.interactions
  const benches = old.benches.filter(b => b.siteId.startsWith('bench-fountain-')).map(b => ({
    ...b, position: offset(b.position, fx, fy, fz),
    seats: b.seats.map(seat => ({ ...seat, use: shift(seat.use, fx, fy, fz), exit: shift(seat.exit, fx, fy, fz) })),
  }))
  const fitness = old.fitness.map(f => ({
    ...f, position: offset(f.position, gx, gy, gz),
    use: shift(f.use, gx, gy, gz), exit: shift(f.exit, gx, gy, gz),
  }))
  const telescopes = old.telescopes.map((t, i) => {
    const [lx, lz] = TOWER_TOP.telescopes[i]!
    const x = tower.x + lx, z = tower.z + lz, yaw = telescopeYaw(x, z)
    const pose = (source: MapPose) => {
      const d = Math.hypot(source.x - t.position[0], source.z - t.position[2])
      return { x: x - Math.sin(yaw) * d, y: deckY + .8, z: z - Math.cos(yaw) * d, yaw }
    }
    return { ...t, yaw, position: [x, deckY, z] as Point3, use: pose(t.use), exit: pose(t.exit) }
  })
  const [nx, nz] = TOWER_TOP.notes
  const notesPosition: Point3 = [tower.x + nx, deckY, tower.z + nz]
  return {
    ...PARK_DATA,
    world: { ...PARK_DATA.world, size: RENEWAL_HALF_SIZE * 2, half: RENEWAL_HALF_SIZE, spawn: RENEWAL_SPAWN },
    tableAnchorIds: tables.map(t => t.id),
    tables, facilities, pavilions, physics,
    interactions: {
      ...old, benches, fitness, telescopes, construction: [],
      notes: { ...old.notes, position: notesPosition, reachPosition: offset(notesPosition, 0, .8, 0) },
      mailbox: { ...old.mailbox, position: [mailbox.x, heightAt(mailbox.x, mailbox.z) + .1, mailbox.z] as Point3 },
      tableSeats: tables.map(t => ({ tableId: t.id, position: t.position, localSeats: t.seatAnchors })),
    },
    surfaces: { ...PARK_DATA.surfaces, lake: { ...PARK_DATA.surfaces.lake,
      x: LAKE.x, z: LAKE.z, rx: LAKE.rx, rz: LAKE.rz, surfaceY: LAKE.y, depth: 3 } },
  }
}
