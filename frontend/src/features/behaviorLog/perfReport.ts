import type { QualityPreset } from '../../config/quality'
import { metrics, summarizeFrames } from '../../performance/metrics'
import type { GpuFamily, PerfReportProps } from './client'

/**
 * GPU 이름 원문은 기기를 가려낼 수 있어 보내지 않고 제조사 분류만 보낸다.
 * 순서가 중요하다: SwiftShader 같은 소프트웨어 렌더러와 Apple을 먼저 가른다.
 */
const GPU_PATTERNS: [GpuFamily, RegExp][] = [
  ['software', /swiftshader|llvmpipe|softpipe|microsoft basic render|software/i],
  ['apple', /apple/i],
  ['nvidia', /nvidia|geforce|quadro|rtx|gtx/i],
  ['amd', /\bamd\b|radeon|\bati\b/i],
  ['intel', /intel/i],
  ['adreno', /adreno|qualcomm/i],
  ['mali', /\bmali\b/i],
  ['powervr', /powervr|imagination/i],
]

export function gpuFamily(renderer: string): GpuFamily {
  if (!renderer || /unavailable|^webgl/i.test(renderer)) return 'unknown'
  return GPU_PATTERNS.find(([, pattern]) => pattern.test(renderer))?.[0] ?? 'other'
}

/** 기기는 desktop/mobile 두 분류만 보낸다. 손가락이 주 입력이고 정밀한 포인터가 없으면 mobile로 본다. */
export function deviceClass(
  match: (query: string) => boolean = query => window.matchMedia(query).matches,
): 'desktop' | 'mobile' {
  try {
    return match('(pointer: coarse)') && !match('(any-pointer: fine)') ? 'mobile' : 'desktop'
  } catch {
    return 'desktop'
  }
}

const clamp = (value: number, min: number, max: number) =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min
const round = (value: number, digits: number) => Math.round(value * 10 ** digits) / 10 ** digits

/**
 * 부를 때마다 지난 호출 뒤의 프레임 수·느린 프레임 수를 센다. 그 사이 그린 프레임이 없으면(탭 숨김 등) null.
 * fps·p95·p99는 metrics가 들고 있는 최근 최대 600프레임 기준이다.
 * 측정이 초기화되면(렌더 방식 변경) 초기화 뒤의 값만 센다.
 */
export function createPerfSampler(quality: QualityPreset, device = deviceClass(), clock = () => performance.now()) {
  let lastFrames = metrics.frames, lastSlow = metrics.slowFrames, lastAt = clock()
  return (): PerfReportProps | null => {
    const now = clock()
    const frames = metrics.frames >= lastFrames ? metrics.frames - lastFrames : metrics.frames
    const slow = metrics.slowFrames >= lastSlow ? metrics.slowFrames - lastSlow : metrics.slowFrames
    const windowSec = Math.round((now - lastAt) / 1000)
    lastFrames = metrics.frames
    lastSlow = metrics.slowFrames
    lastAt = now
    if (frames <= 0 || windowSec < 1) return null
    const summary = summarizeFrames()
    const counted = Math.min(100_000, frames)
    return {
      windowSec: Math.min(600, windowSec),
      frames: counted,
      slowFrames: Math.min(counted, slow),
      fps: round(clamp(summary.fps, 0, 1000), 1),
      p95Ms: round(clamp(summary.p95, 0, 60_000), 1),
      p99Ms: round(clamp(summary.p99, 0, 60_000), 1),
      drawCalls: Math.round(clamp(summary.drawCalls, 0, 1_000_000)),
      triangles: Math.round(clamp(summary.triangles, 0, 100_000_000)),
      dpr: round(clamp(summary.dpr, 0, 8), 2),
      renderMode: summary.renderMode,
      quality,
      device,
      gpu: gpuFamily(summary.renderer),
    }
  }
}
