import { PerspectiveCamera, Vector3 } from 'three'
import { boardPoint } from './Board'

export const YUT_SURFACE_Y = .055
export const YUT_TOKEN_HEIGHT = .17
export const YUT_TEAM_COLORS = ['#356b9e', '#b84e3b', '#347955', '#ce9e31']
export function boardWorldPoint(node: number): [number, number] {
  const [x, y] = boardPoint(node)
  return [(x - 260) * 6 / 520, (y - 260) * 6 / 520]
}

/** 화면 크기가 달라도 판의 모서리·두께·최대 업힌 말까지 화면 안에 둔다. */
export function fitYutCamera(camera: PerspectiveCamera, width: number, height: number) {
  camera.aspect = width / Math.max(1, height)
  camera.fov = 34
  camera.near = .1
  camera.far = 100
  camera.updateProjectionMatrix()
  const direction = new Vector3(0, 1, .62).normalize()
  const target = new Vector3(0, .12, 0)
  const box = (edge: number, bottom: number, top: number) => [-edge, edge].flatMap(x => [bottom, top].flatMap(y => [-edge, edge].map(z => new Vector3(x, y, z))))
  const corners = [...box(3.08, -.64, .062), ...box(2.55, YUT_SURFACE_Y, YUT_SURFACE_Y + 4 * YUT_TOKEN_HEIGHT)]
  const install = (distance: number) => {
    camera.clearViewOffset()
    camera.position.copy(direction).multiplyScalar(distance).add(target)
    camera.lookAt(target)
    camera.updateMatrixWorld()
    const projected = corners.map(point => point.clone().project(camera))
    const centerY = (Math.min(...projected.map(p => p.y)) + Math.max(...projected.map(p => p.y))) / 2
    // 원근 때문에 가까운 앞쪽이 커져도 판의 실제 외곽을 화면 중앙에 둔다.
    camera.setViewOffset(width, height, 0, -centerY * height / 2, width, height)
    return corners.every(point => { const p = point.clone().project(camera); return Math.abs(p.x) <= .96 && Math.abs(p.y) <= .96 })
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
