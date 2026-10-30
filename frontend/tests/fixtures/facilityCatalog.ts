import { readFileSync } from 'node:fs'
import type { FacilityDefinition } from '../../src/features/facilities/protocol'

// Read-only copy of the approved backend catalog: tests must not invent seat/exit coordinates.
export const facilityCatalog = JSON.parse(readFileSync(new URL('../../../backend/src/main/resources/world/facilities.json', import.meta.url), 'utf8')) as {
  mapVersion: string; aimIntervalMs: number; minPitch: number; maxPitch: number; initialPitch: number
  facilities: FacilityDefinition[]
}
export function facilityPage(offset = 0, c = facilityCatalog) {
  const end = Math.min(offset + 10, c.facilities.length)
  return { mapVersion: c.mapVersion, aimIntervalMs: c.aimIntervalMs, minPitch: c.minPitch,
    maxPitch: c.maxPitch, initialPitch: c.initialPitch, offset, total: c.facilities.length,
    nextOffset: end < c.facilities.length ? end : -1, facilities: structuredClone(c.facilities.slice(offset, end)) }
}
