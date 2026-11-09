import { ROOM, route, type Point } from '../plan'
import type { ToyActor } from './ToyPeople'

/** Presentation only. Authoritative occupancy/orders/timers remain on the game driver. */
export class GuestJourney {
  private occupied?: boolean
  private phase: 'hidden' | 'seated' | 'arriving' | 'departing' = 'hidden'
  private path: Point[] = []
  private readonly seat: Point
  private readonly yaw: number
  private readonly entry = { x: 0, z: ROOM.bounds.maxZ - .1 }
  constructor(private actor: ToyActor, private spokesperson = true) {
    this.seat = { x: actor.root.position.x, z: actor.root.position.z }
    this.yaw = actor.root.rotation.y
  }
  private get beside() { return { x: this.seat.x + Math.cos(this.yaw) * .9, z: this.seat.z - Math.sin(this.yaw) * .9 } }
  update(occupied: boolean, eating: boolean, dt: number, reduced: boolean, arrivalRemaining?: number) {
    const first = this.occupied === undefined
    if (!first && occupied !== this.occupied && this.spokesperson) this.actor.greet(occupied ? 'arrival' : 'departure')
    if ((first || reduced) && !(occupied && (arrivalRemaining ?? 0) > 0)) {
      this.phase = occupied ? 'seated' : 'hidden'; this.path = []
      this.actor.root.position.set(this.seat.x, this.actor.guestFloorY, this.seat.z)
      this.actor.root.rotation.y = this.yaw
    } else if (first || occupied !== this.occupied) {
      if (occupied) {
        this.phase = 'arriving'
        this.path = [...route(this.entry, this.beside), this.seat]
        this.actor.root.position.set(this.entry.x, this.actor.guestFloorY, this.entry.z)
      } else if (this.phase === 'seated') {
        this.phase = 'departing'
        this.path = [this.beside, ...route(this.beside, this.entry), { x: 0, z: ROOM.queueZ + 1 }]
      } else { this.phase = 'hidden'; this.path = [] }
    }
    this.occupied = occupied
    const moving = this.phase === 'arriving' || this.phase === 'departing'
    let speed = 4
    if (this.phase === 'arriving' && arrivalRemaining !== undefined) {
      if (arrivalRemaining <= 0) { this.path = []; this.actor.root.position.set(this.seat.x, this.actor.guestFloorY, this.seat.z) }
      else {
        const points = [{ x: this.actor.root.position.x, z: this.actor.root.position.z }, ...this.path]
        const distance = points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - points[i].x, p.z - points[i].z), 0)
        speed = distance / Math.max(.05, arrivalRemaining + dt)
      }
    }
    let budget = Math.max(0, dt) * speed
    while (moving && budget > 0 && this.path.length) {
      const p = this.actor.root.position, next = this.path[0], dx = next.x - p.x, dz = next.z - p.z, d = Math.hypot(dx, dz)
      if (d < .001) { this.path.shift(); continue }
      this.actor.root.rotation.y = Math.atan2(dx, dz)
      const step = Math.min(d, budget); p.x += dx / d * step; p.z += dz / d * step; budget -= step
      if (d <= step + .001) this.path.shift()
    }
    if (moving && !this.path.length) { this.phase = occupied ? 'seated' : 'hidden'; this.actor.root.rotation.y = this.yaw }
    this.actor.root.visible = this.phase !== 'hidden' || this.actor.greetingVisible
    if (this.actor.root.visible) this.actor.pose(dt, { moving: this.phase === 'arriving' || this.phase === 'departing', seated: this.phase === 'seated', eating, reduced })
    this.actor.root.userData.diningPhase = this.phase
  }
}
