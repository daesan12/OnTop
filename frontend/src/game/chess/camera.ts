import type { Camera } from 'three'

export const CHESS_BOARD_SCALE = .14
export const CHESS_BOARD_Y = 1.12
export const CHESS_FOV = 42
export const chessCamera = { ready: false, anchorId: '', current: null as Camera | null }
export const chessCameraActive = (status: string | undefined, hasResult: boolean) => status === 'PLAYING' && !hasResult

/** Fit every corner, including the king's head, between the same side HUD rails as other table games. */
export function chessCameraFrame(width: number, height: number, scale: number, yaw: number, overhead: boolean) {
  const w = Math.max(1, width), h = Math.max(1, height), wide = w >= 1120
  const horizontal = wide ? 264 : 20, vertical = wide ? 36 : h < 500 ? 96 : 172
  const fillX = Math.max(.3, (w - horizontal * 2) / w), fillY = Math.max(.28, (h - vertical * 2) / h)
  const elevation = overhead ? Math.PI / 2 : Math.PI / 3
  const sy = Math.sin(yaw), cy = Math.cos(yaw), se = Math.sin(elevation), ce = Math.cos(elevation)
  const tan = Math.tan(CHESS_FOV * Math.PI / 360), half = 4.55 * CHESS_BOARD_SCALE * scale
  let distance = 1
  for (const x of [-half, half]) for (const z of [-half, half]) for (const y of [-.08, .25]) {
    const right = x * cy - z * sy, up = -x * sy * se + y * ce - z * cy * se
    const depth = x * sy * ce + y * se + z * cy * ce
    distance = Math.max(distance, Math.abs(right) / (tan * w / h * fillX) + depth,
      Math.abs(up) / (tan * fillY) + depth)
  }
  distance *= 1.06
  return { position: [sy * ce * distance, se * distance, cy * ce * distance] as [number, number, number],
    up: overhead ? [-sy, 0, -cy] as [number, number, number] : [0, 1, 0] as [number, number, number] }
}
