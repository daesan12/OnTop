import { PerspectiveCamera, Vector3 } from 'three'
import { boardPoint } from './Board'

export const YUT_SURFACE_Y = .055
export const YUT_TOKEN_HEIGHT = .17
export const YUT_TEAM_COLORS = ['#356b9e', '#b84e3b', '#347955', '#ce9e31']
export interface YutInsets { left: number; right: number; top: number; bottom: number }
export function yutHudInsets(width: number, height: number, teams: number): YutInsets {
  if (width >= 1100 && height >= 640) return {
    left: Math.min(288, Math.max(196, width * .1875)) + 44,
    right: Math.min(270, Math.max(196, width * .176)) + 44, top: 28, bottom: 156,
  }
  if (width >= 1000 || width >= 700 && height < 640) return { left: 220, right: 220, top: 16, bottom: 106 }
  return { left: 12, right: 12, top: height < 640 ? 176 : teams > 2 ? 256 : 188, bottom: height < 640 ? 164 : 204 }
}
export function boardWorldPoint(node: number): [number, number] {
  const [x, y] = boardPoint(node)
  return [(x - 260) * 6 / 520, (y - 260) * 6 / 520]
}

/** 화면 크기가 달라도 판의 모서리·두께·최대 업힌 말까지 화면 안에 둔다. */
export function fitYutCamera(camera: PerspectiveCamera, width: number, height: number, insets: YutInsets = { left: 0, right: 0, top: 0, bottom: 0 }) {
  if (width <= 0 || height <= 0) return
  camera.aspect = width / Math.max(1, height)
  camera.fov = 34
  camera.near = .1
  camera.far = 100
  camera.updateProjectionMatrix()
  const direction = new Vector3(0, 1, .62).normalize()
  const target = new Vector3(0, .12, 0)
  const box = (edge: number, bottom: number, top: number) => [-edge, edge].flatMap(x => [bottom, top].flatMap(y => [-edge, edge].map(z => new Vector3(x, y, z))))
  const corners = [...box(3.08, -.64, .062), ...box(2.55, YUT_SURFACE_Y, YUT_SURFACE_Y + 4 * YUT_TOKEN_HEIGHT)]
  const left = -1 + 2 * insets.left / width, right = 1 - 2 * insets.right / width
  const top = 1 - 2 * insets.top / height, bottom = -1 + 2 * insets.bottom / height
  const install = (distance: number) => {
    camera.clearViewOffset()
    camera.position.copy(direction).multiplyScalar(distance).add(target)
    camera.lookAt(target)
    camera.updateMatrixWorld()
    const projected = corners.map(point => point.clone().project(camera))
    const centerY = (Math.min(...projected.map(p => p.y)) + Math.max(...projected.map(p => p.y))) / 2
    const centerX = (Math.min(...projected.map(p => p.x)) + Math.max(...projected.map(p => p.x))) / 2
    // 원근 때문에 가까운 앞쪽이 커져도 판의 실제 외곽을 화면 중앙에 둔다.
    camera.setViewOffset(width, height, (centerX - (left + right) / 2) * width / 2, ((top + bottom) / 2 - centerY) * height / 2, width, height)
    return corners.every(point => { const p = point.clone().project(camera); return p.x >= left + .02 && p.x <= right - .02 && p.y >= bottom + .02 && p.y <= top - .02 })
  }
  let low = 4, high = 50
  for (let step = 0; step < 36; step++) {
    const distance = (low + high) / 2
    const fits = install(distance)
    if (fits) high = distance
    else low = distance
  }
  install(high)
}
export function projectYutPoint(camera: PerspectiveCamera, node: number, y = YUT_SURFACE_Y) {
  const [x, z] = boardWorldPoint(node)
  const p = new Vector3(x, y, z).project(camera)
  return { x: (p.x + 1) * 50, y: (1 - p.y) * 50 }
}
