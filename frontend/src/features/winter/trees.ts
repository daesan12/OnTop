import { RENEWAL_PARK_ENABLED } from '../../park/mapSelection'
import type { buildParkTreeParts, TreePlanting } from '../../world/art/parkTreeParts'

export const WINTER_TREES_ENABLED = RENEWAL_PARK_ENABLED || typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('winter') === '1'

export function winterTreeIsHeavy(x: number, z: number) {
  const hash = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453
  return hash - Math.floor(hash) < .08
}

/** Seasonal art only: keep the original geometry, instance transforms and trunk placements. */
export function winterTreeParts(parts: ReturnType<typeof buildParkTreeParts>, plantings: readonly TreePlanting[]) {
  const heavy = (x: number, z: number) => {
    let nearest = Infinity, selected = false
    for (const tree of plantings) {
      const [tx, , tz] = tree.position, distance = (x - tx) ** 2 + (z - tz) ** 2
      if (distance < nearest) { nearest = distance; selected = winterTreeIsHeavy(tx, tz) }
    }
    return selected
  }
  return {
    wood: parts.wood,
    crowns: parts.crowns.map(p => ({ ...p, c: heavy(p.p[0], p.p[2]) ? '#dce9ed' : p.c })),
    cones: parts.cones.map(p => ({ ...p, c: heavy(p.p[0], p.p[2]) ? '#dce9ed' : p.c })),
    snowCrowns: parts.crowns.map(p => ({ ...p, c: '#f3f8fa' })),
    snowCones: parts.cones.map(p => ({ ...p, c: '#f3f8fa' })),
  }
}
