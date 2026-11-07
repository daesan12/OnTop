import { COURSE, START } from './course'

type Position = { x: number; y: number; z: number }
export const nearJumpmapStart = (p: Position) => Math.hypot(p.x - START.x, p.z - START.z) < 4
  && Math.abs(p.y - .8 - START.y) < 2

/** Course-local VR, including the launch area and room to jump between adjacent pads. */
export function inJumpmapXRRegion(p: Position) {
  if (![p.x, p.y, p.z].every(Number.isFinite) || p.y < .3) return false
  if (nearJumpmapStart(p)) return true
  return COURSE.some((pad, i) => {
    if (Math.abs(p.y - .8 - pad.top) > 6) return false
    const next = COURSE[Math.min(COURSE.length - 1, i + 1)]!
    const dx = next.x - pad.x, dz = next.z - pad.z, length = dx * dx + dz * dz
    const t = length ? Math.max(0, Math.min(1, ((p.x - pad.x) * dx + (p.z - pad.z) * dz) / length)) : 0
    return Math.hypot(p.x - pad.x - t * dx, p.z - pad.z - t * dz) <= Math.max(pad.radius ?? 0, pad.halfX, pad.halfZ) + 2
  })
}

// Capture the explicit development request before the auth flow normalizes the park URL.
const previewRequested = import.meta.env.DEV && typeof location !== 'undefined'
  && new URLSearchParams(location.search).get('vrPreview') === '1'
export const parkVRPreviewEnabled = () => previewRequested
