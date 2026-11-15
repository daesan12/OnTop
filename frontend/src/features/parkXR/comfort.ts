import { create } from 'zustand'

export const XR_EYE_HEIGHTS = [1.4, 1.6, 1.65, 1.8] as const

export interface XRComfortSettings {
  turnMode: 'smooth' | 'snap'
  turnSpeed: 60 | 90 | 120
  snapAngle: 30 | 45
  posture: 'standing' | 'seated'
  seatedEyeHeight: typeof XR_EYE_HEIGHTS[number]
}
export const DEFAULT_XR_COMFORT: XRComfortSettings = {
  turnMode: 'smooth', turnSpeed: 90, snapAngle: 30, posture: 'seated', seatedEyeHeight: 1.65,
}
const STORAGE_KEY = 'ontop:park-xr-comfort:v1'
export function parseXRComfort(value: unknown): XRComfortSettings {
  const v = value && typeof value === 'object' ? value as Partial<XRComfortSettings> : {}
  return {
    turnMode: v.turnMode === 'snap' ? 'snap' : 'smooth',
    turnSpeed: v.turnSpeed === 60 || v.turnSpeed === 120 ? v.turnSpeed : 90,
    snapAngle: v.snapAngle === 45 ? 45 : 30,
    posture: v.posture === 'standing' || v.posture === 'seated' ? v.posture : DEFAULT_XR_COMFORT.posture,
    seatedEyeHeight: XR_EYE_HEIGHTS.find(height => height === v.seatedEyeHeight) ?? DEFAULT_XR_COMFORT.seatedEyeHeight,
  }
}
function load(): XRComfortSettings {
  try { return parseXRComfort(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')) }
  catch { return { ...DEFAULT_XR_COMFORT } }
}
export const useXRComfort = create<{
  settings: XRComfortSettings; heightRevision: number; heightNotice: string
}>(() => ({ settings: load(), heightRevision: 0, heightNotice: '' }))

export function setXRComfort(patch: Partial<XRComfortSettings>) {
  const before = useXRComfort.getState(), settings = parseXRComfort({ ...before.settings, ...patch })
  const heightChanged = settings.posture !== before.settings.posture
    || settings.seatedEyeHeight !== before.settings.seatedEyeHeight
  useXRComfort.setState({ settings, ...(heightChanged ? {
    heightRevision: before.heightRevision + 1, heightNotice: '멈춘 뒤 현재 자세로 눈높이를 맞춰요.',
  } : {}) })
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)) }
  catch { /* 저장을 막은 브라우저에서도 현재 세션의 선택은 유지한다. */ }
}
export function requestXRHeightReset() {
  useXRComfort.setState(s => ({ heightRevision: s.heightRevision + 1, heightNotice: '멈춘 뒤 현재 자세로 눈높이를 맞춰요.' }))
}
export function setXRHeightNotice(heightNotice: string) {
  if (useXRComfort.getState().heightNotice !== heightNotice) useXRComfort.setState({ heightNotice })
}
export const turnLabel = (s: XRComfortSettings) => s.turnMode === 'smooth' ? '부드럽게' : '스냅'

/** 세션별 보정만 보관한다. 실제 머리 높이와 추적 위치는 저장하지 않는다. */
export class XRHeightCalibration {
  offset = 0
  reset() { this.offset = 0 }
  calibrate(headY: number, settings: XRComfortSettings): boolean {
    if (!Number.isFinite(headY) || headY < .2 || headY > 2.8) return false
    this.offset = settings.posture === 'seated' ? settings.seatedEyeHeight - headY : 0
    return true
  }
}
