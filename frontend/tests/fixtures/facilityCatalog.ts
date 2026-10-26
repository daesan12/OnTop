import { PARK_DATA } from '../../src/map/park'
import { EXPECTED_MAP_VERSION } from '../../src/config/mapVersion'
import type { FacilityDefinition } from '../../src/features/facilities/protocol'

// Read-only copy of the approved backend catalog: tests must not invent seat/exit coordinates.
export const facilityCatalog = {
  mapVersion:EXPECTED_MAP_VERSION,...PARK_DATA.physics.telescope,
  facilities:[...PARK_DATA.interactions.benches,...PARK_DATA.interactions.fitness,...PARK_DATA.interactions.telescopes].map(f=>({
    facilityId:f.id,kind:f.kind,center:{x:f.position[0],y:f.position[1]+.8,z:f.position[2],yaw:f.yaw},radius:f.radius,heightTolerance:f.heightTolerance,
    seats:'seats' in f?f.seats.map(s=>s.use):[f.use],exit:'seats' in f?f.seats[0]!.exit:f.exit,
  }))
} as {
  mapVersion: string; aimIntervalMs: number; minPitch: number; maxPitch: number; initialPitch: number
  facilities: FacilityDefinition[]
}
export function facilityPage(offset = 0) {
  const c = facilityCatalog, end = Math.min(offset + 10, c.facilities.length)
  return { mapVersion: c.mapVersion, aimIntervalMs: c.aimIntervalMs, minPitch: c.minPitch,
    maxPitch: c.maxPitch, initialPitch: c.initialPitch, offset, total: c.facilities.length,
    nextOffset: end < c.facilities.length ? end : -1, facilities: structuredClone(c.facilities.slice(offset, end)) }
}
