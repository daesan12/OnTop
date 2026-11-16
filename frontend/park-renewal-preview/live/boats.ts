import type { MapPose, Point3 } from '../../src/map/park/interactionData'
import { BOAT_ROUTE, DOCK_SCALE, LAKE, site } from '../plan'
import { type DuckBoatRoute, type RidePoint, duckBoatRidePose } from '../duckBoatRidePath'

export const DUCK_BOAT_ID = 'duck-boat'
/** The two moored boats stay as scenery. Ride boats appear in open water in front of the dock. */
export const DUCK_BOAT_PICKUP: RidePoint = [59, 9.6]
const LAP_SECONDS = 60
const LANE_CLEARANCE = 7
// GLB anchor_driver/anchor_passenger (±0.47, 0.82, 0.48) minus the seated hip height, plus the 0.8 avatar origin.
const SEATS = [[-.47, .82 - .56 + .8, .48], [.47, .82 - .56 + .8, .48]] as const

function bezier(a: RidePoint, b: RidePoint, c: RidePoint, d: RidePoint, steps: number): RidePoint[] {
  return Array.from({ length: steps }, (_, i) => {
    const t = (i + 1) / steps, u = 1 - t
    return [u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0],
      u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1]] as const
  })
}

/** Leaves the pick-up point heading into the lake, joins the decorative loop and returns head-first. */
export function buildDuckBoatRoute(): DuckBoatRoute {
  const { x, z, rx, rz } = BOAT_ROUTE
  const at = (a: number): RidePoint => [x + Math.cos(a) * rx, z + Math.sin(a) * rz]
  const tangent = (a: number): RidePoint => { const dx = -Math.sin(a) * rx, dz = Math.cos(a) * rz, l = Math.hypot(dx, dz); return [dx / l, dz / l] }
  const join = .55, a1 = Math.PI / 2 + join, a2 = Math.PI / 2 - join + Math.PI * 2, handle = 3
  const [sx, sz] = DUCK_BOAT_PICKUP, out = at(a1), back = at(a2), to = tangent(a1), from = tangent(a2)
  const loopSteps = 240
  const points: RidePoint[] = [DUCK_BOAT_PICKUP,
    ...bezier(DUCK_BOAT_PICKUP, [sx, sz - handle], [out[0] - to[0] * handle, out[1] - to[1] * handle], out, 24),
    ...Array.from({ length: loopSteps }, (_, i) => at(a1 + (a2 - a1) * (i + 1) / loopSteps)),
    ...bezier(back, [back[0] + from[0] * handle, back[1] + from[1] * handle], [sx, sz - handle], DUCK_BOAT_PICKUP, 24)]
  const route: DuckBoatRoute = { seconds: LAP_SECONDS, y: LAKE.y + .08, points, seats: SEATS, laneSeconds: 0 }
  let lane = 0
  for (let t = 0; t < LAP_SECONDS / 2; t += .05) {
    const p = duckBoatRidePose(route, t)
    if (Math.hypot(p.x - sx, p.z - sz) > LANE_CLEARANCE) break
    lane = t
  }
  return { ...route, laneSeconds: Math.ceil(lane * 10) / 10 }
}

export function buildRenewalBoats() {
  const dock = site('dock'), top = LAKE.y + .65 * DOCK_SCALE
  const pose = (px: number, pz: number, yaw: number): MapPose => ({ x: px, y: top + .8, z: pz, yaw })
  return [{
    id: DUCK_BOAT_ID, kind: 'BOAT' as const,
    position: [dock.x, top, dock.z - .9] as Point3, yaw: 0, radius: 4.2, heightTolerance: .7,
    // Two teams wait on the mooring fingers beside the moored boats (west team 0, east team 1),
    // facing their boat. Riders return to the side entrance.
    queue: [-1, 1].flatMap(side => [-2.7, -4.3].map(dz => pose(dock.x + side * 4.47, dock.z + dz, -side * Math.PI / 2))),
    exit: pose(dock.x - 3.4, dock.z + 1.1, -Math.PI / 2),
    route: buildDuckBoatRoute(),
  }]
}
