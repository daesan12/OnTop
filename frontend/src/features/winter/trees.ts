import { RENEWAL_PARK_ENABLED } from '../../park/mapSelection'
import type { buildParkTreeParts } from '../../world/art/parkTreeParts'

export const WINTER_TREES_ENABLED = RENEWAL_PARK_ENABLED || typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('winter') === '1'

const snow = ['#f3f8f7', '#dce9ed', '#c7dce3', '#eaf3f5'] as const

/** Seasonal art only: keep the original geometry, instance transforms and trunk placements. */
export function winterTreeParts(parts: ReturnType<typeof buildParkTreeParts>) {
  const tone = (x: number, z: number) => snow[Math.abs(Math.round(x * 37 + z * 71)) % snow.length]!
  return {
    wood: parts.wood,
    crowns: parts.crowns.map(p => ({ ...p, c: tone(p.p[0], p.p[2]) })),
    // Each evergreen has four overlapping tiers; dark lower needles frame the snowy upper tiers.
    cones: parts.cones.map((p, i) => ({ ...p, c: i % 4 === 0 ? '#345c50' : tone(p.p[0], p.p[2]) })),
  }
}
