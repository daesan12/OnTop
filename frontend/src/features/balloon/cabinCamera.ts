import type { Vector3 } from 'three'
import type { Flight } from './flight'

const initial = { yaw: .57, pitch: .72 }
export const cabinCamera = { ...initial }

export function balloonCanLook(phase: Flight['phase'] | undefined) {
  return phase === 'takeoff' || phase === 'flying' || phase === 'returning'
}

export function resetCabinCamera() {
  Object.assign(cabinCamera, initial)
}

export function dragCabinCamera(dx: number, dy: number) {
  cabinCamera.yaw = (cabinCamera.yaw - dx * .006) % (2 * Math.PI)
  cabinCamera.pitch = Math.max(-.15, Math.min(1.4, cabinCamera.pitch + dy * .005))
}

export function setBalloonOrbit({ x, y, z }: Flight['position'], position: Vector3, target: Vector3, cockpit: boolean) {
  const { yaw, pitch } = cabinCamera
  // Keep the wider, shallower cockpit framing so the park stays visible around the basket.
  const distance = cockpit ? 11.4 : 6.3
  const angle = cockpit ? Math.min(.85, Math.max(.08, pitch - .32)) : Math.min(1.1, Math.max(.3, pitch))
  const radius = distance * Math.cos(angle)
  position.set(x + Math.sin(yaw) * radius, y + .95 + distance * Math.sin(angle), z + Math.cos(yaw) * radius)
  target.set(x, y + .95, z)
}
