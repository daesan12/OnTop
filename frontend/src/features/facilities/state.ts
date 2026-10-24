import { create } from 'zustand'
import type { FacilityCatalogPage, FacilityDefinition, FacilityLease } from './protocol'

// The explicit preview is the only local facility simulation. Normal dev uses Spring too.
export const serverFacilities = !(import.meta.env?.DEV && import.meta.env.MODE === 'facility-preview')
const initial = () => ({ channelId: '', version: -1, ready: false, loading: false, pending: false,
  awaitingWorld: false, uncertain: false, error: '', catalog: {} as Record<string, FacilityDefinition>,
  options: null as Omit<FacilityCatalogPage, 'offset' | 'total' | 'nextOffset' | 'facilities'> | null,
  occupancies: {} as Record<string, FacilityLease> })
export const useFacilityState = create(initial)
export function resetFacilities() { useFacilityState.setState(initial(), true) }
export function facilityAvailable(id: string) {
  const s = useFacilityState.getState()
  return s.ready && !s.uncertain && !s.awaitingWorld && !!s.catalog[id]
}
export function facilityMovementBlocked(userId: string) {
  const s = useFacilityState.getState()
  return s.pending || s.awaitingWorld || s.uncertain || !!s.occupancies[userId]
}
export function facilityInRange(position: { x: number; y: number; z: number }, id: string): boolean | undefined {
  const d = useFacilityState.getState().catalog[id]
  if (!d) return undefined
  return [position.x, position.y, position.z].every(Number.isFinite)
    && Math.hypot(position.x - d.center.x, position.z - d.center.z) <= d.radius
    && Math.abs(position.y - d.center.y) <= d.heightTolerance
}
