/** Shared duck-boat ride path. Pure data and math only; Java interpolates the same exported points. */
export type RidePoint = readonly [number, number]
export type RideSeat = readonly [number, number, number]
export interface DuckBoatRoute {
  /** One trip from the dock pick-up point, around the island, back to the same point. */
  seconds: number
  /** Boat model origin height (waterline placement). */
  y: number
  points: readonly RidePoint[]
  /** Rider pose offsets from the boat origin in boat-local metres (model forward is -Z). */
  seats: readonly RideSeat[]
  /** Seconds a departing or arriving boat stays within the shared pick-up lane. */
  laneSeconds: number
}
export interface RidePose { x: number; y: number; z: number; boatYaw: number; riderYaw: number }

const lengths = new WeakMap<DuckBoatRoute, number[]>()
function cumulative(route: DuckBoatRoute) {
  let out = lengths.get(route)
  if (!out) {
    out = [0]
    for (let i = 1; i < route.points.length; i++) {
      const [ax, az] = route.points[i - 1]!, [bx, bz] = route.points[i]!
      out.push(out[i - 1]! + Math.hypot(bx - ax, bz - az))
    }
    lengths.set(route, out)
  }
  return out
}
export const routeLength = (route: DuckBoatRoute) => cumulative(route).at(-1)!

/** Constant-speed boat pose after `elapsed` seconds; clamped to the trip ends. */
export function duckBoatRidePose(route: DuckBoatRoute, elapsed: number, out: RidePose = { x: 0, y: 0, z: 0, boatYaw: 0, riderYaw: 0 }) {
  const d = cumulative(route), total = d.at(-1)!
  const s = Math.max(0, Math.min(1, elapsed / route.seconds)) * total
  let i = 1
  while (i < d.length - 1 && d[i]! < s) i++
  const [ax, az] = route.points[i - 1]!, [bx, bz] = route.points[i]!, span = d[i]! - d[i - 1]!
  const u = span > 0 ? (s - d[i - 1]!) / span : 0
  out.x = ax + (bx - ax) * u
  out.z = az + (bz - az) * u
  out.y = route.y
  out.riderYaw = Math.atan2(bx - ax, bz - az)
  out.boatYaw = out.riderYaw + Math.PI
  return out
}

/** World rider pose (avatar origin, ground + 0.8 convention) for a seat on a boat pose. */
export function duckBoatSeatPose(route: DuckBoatRoute, boat: RidePose, seat: number) {
  const [lx, ly, lz] = route.seats[seat] ?? route.seats[0]!
  const c = Math.cos(boat.boatYaw), s = Math.sin(boat.boatYaw)
  return { x: boat.x + lx * c + lz * s, y: boat.y + ly, z: boat.z - lx * s + lz * c, yaw: boat.riderYaw }
}
