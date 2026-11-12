import { PARK_LAYOUT } from '../../map/park'
import { RENEWAL_PARK_ENABLED } from '../../park/mapSelection'
import { canReachRenewalRecreation, renewalMap } from '../../park/renewalMap'

const room = renewalMap?.data.interactions.recreation?.find(site => site.id === 'fortune')
const oldSite = {
  id: 'plaza-fortune', x: PARK_LAYOUT.LIFE_PLAZA.x, z: PARK_LAYOUT.LIFE_PLAZA.z,
  y: PARK_LAYOUT.walkHeight(PARK_LAYOUT.LIFE_PLAZA.x, PARK_LAYOUT.LIFE_PLAZA.z),
}
export const FORTUNE_SITE = RENEWAL_PARK_ENABLED && room ? {
  id: 'fortune-room', x: room.reachPosition[0], y: room.reachPosition[1] - .8, z: room.reachPosition[2],
} : oldSite
export const FORTUNE_REACH = { x: FORTUNE_SITE.x, y: FORTUNE_SITE.y + .8, z: FORTUNE_SITE.z }
export function canReachFortune(p: { x: number; y: number; z: number } | undefined) {
  if (RENEWAL_PARK_ENABLED) return !!p && !!room && canReachRenewalRecreation(p, room)
  return !!p && [p.x, p.y, p.z].every(Number.isFinite)
    && Math.hypot(p.x - FORTUNE_REACH.x, p.z - FORTUNE_REACH.z) <= 3.4
    && Math.abs(p.y - FORTUNE_REACH.y) <= 1
}
