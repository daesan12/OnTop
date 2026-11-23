import { BOARD_SPAN, CELL_PITCH } from './presentation'
import type { Quoridor } from './protocol'

export const QUORIDOR_FOV = 42
const elevation = Math.PI / 3
export const quoridorViewport = { gameId: '', top: 140, bottom: 150, left: 16, right: 16 }
export const quoridorCamera = { gameId: '', ready: false }
export const quoridorCameraActive = (status: string | undefined, hasResult: boolean, spectator = false) =>
  !!status && (spectator || status === 'PLAYING' && !hasResult)
export interface QuoridorInsets { top: number; bottom: number; left: number; right: number }

/** 위아래 빈 띠와 양옆 UI 사이 중 판을 더 크게 담을 수 있는 안전 영역을 고른다. */
export function largerQuoridorViewport(width: number, height: number, candidates: QuoridorInsets[]) {
  let best = candidates[0], nearest = Infinity
  for (const candidate of candidates) {
    const frame = quoridorCameraPose(width, height, 1, 0, candidate)
    const distance = Math.hypot(...frame.position.map((value, i) => value - frame.target[i]))
    if (distance < nearest) { best = candidate; nearest = distance }
  }
  return best
}
/** 자신의 출발선 뒤에서 본다. 서버의 칸 좌표는 회전하지 않는다. */
export function quoridorYaw(goal?: Quoridor['players'][number]['goal']) {
  return goal === 'SOUTH' ? Math.PI : goal === 'WEST' ? Math.PI / 2 : goal === 'EAST' ? -Math.PI / 2 : 0
}

/** 판 두께와 집어 든 말·장벽까지 HUD의 빈 영역에 투시 투영으로 맞춘다. */
export function quoridorCameraPose(width: number, height: number, scale = 1, yaw = 0,
  insets = { top: 140, bottom: 150, left: 16, right: 16 }) {
  const w = Math.max(1, width), h = Math.max(1, height), aspect = w / h
  const usableWidth = Math.max(1, w - insets.left - insets.right)
  const usableHeight = Math.max(1, h - insets.top - insets.bottom)
  const tan = Math.tan(QUORIDOR_FOV * Math.PI / 360), sin = Math.sin(yaw), cos = Math.cos(yaw)
  const rise = Math.sin(elevation), run = Math.cos(elevation)
  const corners: { across: number; up: number; toward: number }[] = []
  const layer = (halfX: number, halfZ: number, y: number) => {
    for (const x of [-halfX * scale, halfX * scale]) for (const z of [-halfZ * scale, halfZ * scale])
      corners.push({ across: cos * x - sin * z, up: -sin * rise * x + run * y - cos * rise * z,
        toward: sin * run * x + rise * y + cos * run * z })
  }
  // 판 모서리 위에 말이 서 있다고 가정하지 않고, 실제 판과 집은 도구의 범위를 따로 맞춘다.
  for (const y of [-.08, .055]) layer(BOARD_SPAN / 2 + .008, BOARD_SPAN / 2 + .008, y)
  layer(4 * CELL_PITCH + .052, 4 * CELL_PITCH + .052, .27) // 가장자리 칸에서 집어 든 말
  layer(.6, .6, .24) // 가장자리 홈에서 집어 든 두 칸 장벽
  layer(.13, .675, .14); layer(.675, .13, .14) // 판 테두리의 장벽 받침
  const left = 2 * insets.left / w - 1, right = 2 * (insets.left + usableWidth) / w - 1
  const top = 1 - 2 * insets.top / h, bottom = 1 - 2 * (insets.top + usableHeight) / h
  // 각 꼭짓점을 화면 안에 두는 카메라 평행 이동의 교집합을 구한다.
  const fit = (distance: number) => {
    let minX = -Infinity, maxX = Infinity, minY = -Infinity, maxY = Infinity
    for (const p of corners) {
      const depth = distance - p.toward
      if (depth <= .01) return null
      minX = Math.max(minX, p.across - right * depth * tan * aspect)
      maxX = Math.min(maxX, p.across - left * depth * tan * aspect)
      minY = Math.max(minY, p.up - top * depth * tan)
      maxY = Math.min(maxY, p.up - bottom * depth * tan)
    }
    return minX <= maxX && minY <= maxY ? { x: (minX + maxX) / 2, y: (minY + maxY) / 2 } : null
  }
  let low = 0, high = Math.max(2, scale * 4)
  while (!fit(high) && high < 10000) high *= 2
  for (let i = 0; i < 32; i++) { const middle = (low + high) / 2; if (fit(middle)) high = middle; else low = middle }
  const distance = high * 1.015, shift = fit(distance)!
  const target: [number, number, number] = [cos * shift.x - sin * rise * shift.y, run * shift.y, -sin * shift.x - cos * rise * shift.y]
  return { target, position: [target[0] + sin * run * distance, target[1] + rise * distance,
    target[2] + cos * run * distance] as [number, number, number] }
}
