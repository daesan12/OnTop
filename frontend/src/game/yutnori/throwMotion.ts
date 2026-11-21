import { Box3, Euler, PerspectiveCamera, Vector3 } from 'three'

export const THROW_DURATION = 1.95
export const STICK_RADIUS = .18
export const STICK_LENGTH = 2.25
const TAU = Math.PI * 2
const clamp = (value: number) => Math.min(1, Math.max(0, value))

/** 결과를 만들지 않고 서버 윷면에 맞는 회전과 접지 위치만 계산한다. */
export function throwPose(seconds: number, index: number, mask: number, seed: number, out = false) {
  const p = clamp((seconds - index * .035) / 1.8)
  const remaining = (1 - p) ** 3
  const flat = !!(mask & 1 << index)
  const roll = (flat ? Math.PI : 0) + TAU * (3 + (seed + index) % 2) * remaining
  const pitch = TAU * remaining
  const yaw = [-.12, .10, -.14, .16][index] + .6 * remaining * (index % 2 ? 1 : -1)
  const cosine = Math.cos(roll)
  const support = cosine <= 0 ? STICK_RADIUS + STICK_RADIUS / 2 * cosine
    : STICK_RADIUS * Math.abs(Math.sin(roll)) + STICK_RADIUS / 2 * cosine
  let bounce = 0
  if (p < .48) bounce = 1.8 * Math.sin(Math.PI * p / .48)
  else if (p < .72) bounce = .38 * Math.sin(Math.PI * (p - .48) / .24)
  else if (p < .87) bounce = .12 * Math.sin(Math.PI * (p - .72) / .15)
  else bounce = .025 * Math.sin(Math.PI * (p - .87) / .13)
  const x = -1.17 + index * .78 + .6 * remaining * (index % 2 ? 1 : -1) + (out && index === 3 ? 1.1 * p : 0)
  const z = [0, .08, -.09, .03][index] - .8 * remaining
  const y = .055 + support + STICK_LENGTH / 2 * Math.abs(Math.sin(pitch)) + Math.max(0, bounce)
  return { position: [x, y, z] as [number, number, number], rotation: [pitch, yaw, roll] as [number, number, number] }
}


/** 던지는 동안의 입체 외곽과 멍석을 함께 프레임 안에 담는다. */
export function fitThrowCamera(camera: PerspectiveCamera, width: number, height: number, animating: boolean, mask: number, seed: number, out = false) {
  if (width <= 0 || height <= 0) return
  camera.aspect = width / height; camera.fov = 36; camera.near = .1; camera.far = 100; camera.updateProjectionMatrix()
  const bounds = new Box3(new Vector3(-2.3, -.12, -1.65), new Vector3(2.3, .05, 1.65))
  const corner = new Vector3(), rotation = new Euler(0, 0, 0, 'YXZ')
  for (let step = 0; step <= (animating ? 30 : 0); step++) {
    for (let index = 0; index < 4; index++) {
      const pose = throwPose(animating ? step / 30 * THROW_DURATION : THROW_DURATION, index, mask, seed, out)
      rotation.set(...pose.rotation, 'YXZ')
      for (const x of [-STICK_RADIUS - .015, STICK_RADIUS + .015]) for (const y of [-STICK_RADIUS / 2 - .015, STICK_RADIUS / 2 + .015]) for (const z of [-STICK_LENGTH / 2 - .015, STICK_LENGTH / 2 + .015]) {
        corner.set(x, y, z).applyEuler(rotation).add(new Vector3(...pose.position)); bounds.expandByPoint(corner)
      }
    }
  }
  const center = bounds.getCenter(new Vector3()), direction = new Vector3(0, 1, .85).normalize()
  const corners = [bounds.min.x, bounds.max.x].flatMap(x => [bounds.min.y, bounds.max.y].flatMap(y => [bounds.min.z, bounds.max.z].map(z => new Vector3(x, y, z))))
  const install = (distance: number) => {
    camera.position.copy(direction).multiplyScalar(distance).add(center); camera.lookAt(center); camera.updateMatrixWorld()
    return corners.every(point => { const p = point.clone().project(camera); return Math.abs(p.x) <= .93 && Math.abs(p.y) <= .93 })
  }
  let low = 4, high = 50
  for (let step = 0; step < 26; step++) { const distance = (low + high) / 2; if (install(distance)) high = distance; else low = distance }
  install(high)
}
