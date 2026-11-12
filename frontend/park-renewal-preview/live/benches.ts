import { PARK_DATA } from '../../src/map/park'
import type { MapPose, Point3 } from '../../src/map/park/interactionData'
import { SITES as originalSites } from '../../src/layout-preview/layout'
import { facilityYaw } from '../facilityPlacement'
import { groundSurfaceHeight } from '../groundSurface'
import { benches as pathBenches } from '../landscape'
import { PAVILION_TARGETS } from '../mapping/identities'
import { pavilionBenchSegments } from '../pavilionBenchLayout'
import { FISHING_BENCHES, FISHING_DECK, LAKE, STATION_SCALE, STATION_STAIRS, SUB_PAVILION_SCALE, facilityGroundY, heightAt, site } from '../plan'
import { TOWER_TOP } from '../towerFurniturePlan'

type BenchAnchor = (typeof PARK_DATA.interactions.benches)[number] & {
  seatHeight: number
  pavilionId?: string
}

function bench(id: string, position: Point3, yaw: number, seatHeight: number, exitDistance: number,
  options: { pavilionId?: string; exitFloor?: (x: number, z: number) => number; seatOffset?: number; seatDepth?: number } = {}): BenchAnchor {
  const [x, y, z] = position, sin = Math.sin(yaw), cos = Math.cos(yaw)
  const place = (side: number, forward: number): MapPose => ({
    x: x + side * cos + forward * sin, y: y + .8, z: z - side * sin + forward * cos, yaw,
  })
  const exit = place(0, exitDistance)
  if (options.exitFloor) exit.y = options.exitFloor(exit.x, exit.z) + .8
  const offset = options.seatOffset ?? .65
  return { id, siteId: id, kind: 'BENCH', position, yaw, radius: 3, heightTolerance: .7, seatHeight,
    ...(options.pavilionId ? { pavilionId: options.pavilionId } : {}),
    seats: [-offset, offset].map((side, seatIndex) => ({
      seatIndex, use: place(side, options.seatDepth ?? -.06), exit,
    })),
  }
}

export function buildRenewalBenches(): BenchAnchor[] {
  const old = PARK_DATA.interactions.benches
  const inherited = old.flatMap((b): BenchAnchor[] => {
    const fountain = b.siteId.startsWith('bench-fountain-')
    if (!fountain && !b.siteId.startsWith('bench-fitness-ring-')) return []
    const id = fountain ? 'fountain' : 'fitness', target = site(id), original = originalSites[id]
    const x = target.x - original.x, y = heightAt(target.x, target.z), z = target.z - original.z
    const shift = (pose: MapPose) => ({ ...pose, x: pose.x + x, y: pose.y + y, z: pose.z + z })
    return [{ ...b, seatHeight: fountain ? .56 : .62,
      position: [b.position[0] + x, b.position[1] + y, b.position[2] + z],
      seats: b.seats.map(seat => ({ ...seat, use: shift(seat.use), exit: shift(seat.exit) })),
    }]
  })
  const pavilions = Object.entries(PAVILION_TARGETS).flatMap(([pavilionId, id]) => {
    const s = site(id), main = pavilionId === 'P0', scale = main ? 1 : 1.1 * SUB_PAVILION_SCALE
    const base = main ? facilityGroundY(s) + .115 : pavilionId === 'P5' ? 4.2 : heightAt(s.x, s.z)
    const yaw = pavilionId === 'P5' ? -Math.PI / 2 : facilityYaw(s), sin = Math.sin(yaw), cos = Math.cos(yaw)
    return pavilionBenchSegments(main ? 'main' : 'rest').map(b => bench(`bench-${pavilionId}-bay-${b.side}`,
      [s.x + (b.x * cos + b.z * sin) * scale, base + b.floor * scale, s.z + (-b.x * sin + b.z * cos) * scale],
      yaw + b.yaw - Math.PI, b.seatHeight * scale, 1.25, { pavilionId }))
  })
  const tower = site('tower'), towerFloor = facilityGroundY(tower) + TOWER_TOP.floor
  const station = site('balloon'), stationFloor = heightAt(station.x, station.z) + STATION_STAIRS.top
  // The station GLB scales the waiting shelter 1.6× horizontally before the overall station scale.
  const stationScale = 1.6 * STATION_SCALE
  return [
    ...inherited, ...pavilions,
    ...pathBenches.map(({ point: [x, z], yaw }, i) => bench('renewal-bench-' + i, [x, heightAt(x, z) + .12, z], yaw, .58, 1.5,
      { exitFloor: groundSurfaceHeight })),
    ...TOWER_TOP.benches.map(([x, z], i) => bench('tower-rest-bench-' + i, [tower.x + x, towerFloor + .015, tower.z + z],
      Math.atan2(-x, -z), .56, 1.5)),
    ...FISHING_BENCHES.map(([x, z, yaw], i) => bench('fishing-rest-bench-' + i, [x, FISHING_DECK.top, z], yaw, .55, 1.2,
      { seatOffset: .37 })),
    bench('balloon-station-waiting-bench', [station.x - 2.15 * stationScale, stationFloor, station.z - 2.42 * stationScale],
      0, .71 * STATION_SCALE, 1.8, { seatOffset: .45 * stationScale }),
  ]
}
