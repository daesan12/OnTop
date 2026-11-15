const initial = { yaw: .57, pitch: .72 }
export const cabinCamera = { ...initial }

export function resetCabinCamera() {
  Object.assign(cabinCamera, initial)
}

export function dragCabinCamera(dx: number, dy: number) {
  cabinCamera.yaw = (cabinCamera.yaw - dx * .006) % (2 * Math.PI)
  cabinCamera.pitch = Math.max(-.15, Math.min(1.4, cabinCamera.pitch + dy * .005))
}
