import { create } from 'zustand'
import type { FacilityCatalogPage, FacilityDefinition, FacilityLease } from './protocol'

// The explicit preview is the only local facility simulation. Normal dev uses Spring too.
export const serverFacilities = !(import.meta.env?.DEV && import.meta.env.MODE === 'facility-preview')
const initial = () => ({ channelId: '', version: -1, ready: false, loading: false, pending: false,
  awaitingWorld: false, uncertain: false, error: '', catalog: {} as Record<string, FacilityDefinition>,
  options: null as Omit<FacilityCatalogPage, 'offset' | 'total' | 'nextOffset' | 'facilities'> | null,
  occupancies: {} as Record<string, FacilityLease> })
export const useFacilityState = create(initial)
export function resetFacilities() { clearFacilityUseNotice(); useFacilityState.setState(initial(), true) }
export function facilityAvailable(id: string) {
  const s = useFacilityState.getState()
  return s.ready && !s.uncertain && !s.awaitingWorld && !!s.catalog[id]
}
export function facilityMovementBlocked(userId: string) {
  const s = useFacilityState.getState()
  return s.pending || s.awaitingWorld || s.uncertain || !!s.occupancies[userId]
}

/** A rejected interaction is temporary guidance, not a persistent connection failure. */
export class FacilityUseBlockedError extends Error {
  constructor() { super('먼저 시설 이용·승인 위치 확인을 마쳐주세요.') }
}
export const useFacilityUseNotice = create(() => ({ message: '' }))
let noticeTimer: ReturnType<typeof setTimeout> | undefined
let noticeSubscription: (() => void) | undefined
export function clearFacilityUseNotice() {
  clearTimeout(noticeTimer)
  noticeTimer = undefined
  noticeSubscription?.()
  noticeSubscription = undefined
  if (useFacilityUseNotice.getState().message) useFacilityUseNotice.setState({ message: '' })
}
export function showFacilityUseNotice(userId: string) {
  clearFacilityUseNotice()
  useFacilityUseNotice.setState({ message: new FacilityUseBlockedError().message })
  const resolved = () => { if (!facilityMovementBlocked(userId)) clearFacilityUseNotice() }
  noticeSubscription = useFacilityState.subscribe(resolved)
  noticeTimer = setTimeout(clearFacilityUseNotice, 3000)
  resolved()
}
export function facilityInRange(position: { x: number; y: number; z: number }, id: string): boolean | undefined {
  const d = useFacilityState.getState().catalog[id]
  if (!d) return undefined
  return [position.x, position.y, position.z].every(Number.isFinite)
    && Math.hypot(position.x - d.center.x, position.z - d.center.z) <= d.radius
    && Math.abs(position.y - d.center.y) <= d.heightTolerance
}
