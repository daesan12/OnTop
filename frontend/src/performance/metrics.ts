export interface FrameReport {
  renderMode: 'continuous' | 'on-demand' | 'paused'
  fps: number
  p95: number
  p99: number
  max: number
  frames: number
  slowFrames: number
  drawCalls: number
  triangles: number
  geometries: number
  textures: number
  width: number
  height: number
  dpr: number
  firstFrameMs: number
  renderer: string
}
const frames: number[] = []
export const metrics: FrameReport = {
  renderMode: 'paused',
  fps: 0,
  p95: 0,
  p99: 0,
  max: 0,
  frames: 0,
  slowFrames: 0,
  drawCalls: 0,
  triangles: 0,
  geometries: 0,
  textures: 0,
  width: 0,
  height: 0,
  dpr: 0,
  firstFrameMs: 0,
  renderer: 'WebGL 2',
}
export function recordFrame(ms: number) {
  frames.push(ms)
  if (frames.length > 600) frames.shift()
  metrics.frames++
  if (ms > 50) metrics.slowFrames++
}
export function summarizeFrames() {
  const sorted = [...frames].sort((a, b) => a - b)
  metrics.fps = frames.length
    ? 1000 / (frames.reduce((sum, n) => sum + n, 0) / frames.length)
    : 0
  metrics.p95 = sorted[Math.floor((sorted.length - 1) * 0.95)] ?? 0
  metrics.p99 = sorted[Math.floor((sorted.length - 1) * 0.99)] ?? 0
  metrics.max = sorted.at(-1) ?? 0
  return { ...metrics }
}
export function resetMetrics() {
  frames.length = 0
  metrics.frames = 0
  metrics.slowFrames = 0
  metrics.fps = 0
  metrics.p95 = 0
  metrics.p99 = 0
  metrics.max = 0
}
