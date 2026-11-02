export interface VrEntrance { x: number; y: number; z: number; yaw: number; radius: number }
/** Entrance is outside the hall's collision footprint, on its local +Z side. */
export function vrEntrance(site: { x: number; z: number }, yaw: number): VrEntrance {
  return { x: site.x + Math.sin(yaw) * 7.7, y: 0.8, z: site.z + Math.cos(yaw) * 7.7, yaw, radius: 2.8 }
}
export function canReachVrEntrance(position: { x: number; y: number; z: number }, entrance: VrEntrance): boolean {
  return [position.x, position.y, position.z].every(Number.isFinite)
    && Math.hypot(position.x - entrance.x, position.z - entrance.z) <= entrance.radius
    && Math.abs(position.y - entrance.y) <= 0.9
}
