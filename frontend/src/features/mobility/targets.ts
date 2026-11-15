import { renewalMap } from '../../park/renewalMap'
import { RENTAL_PAIR_SPACING } from '../../../park-renewal-preview/plan'
import { interactionAim, interactionScore, readInteractionDirection } from '../interactions/interactionAim'
import { vehicles, type RentalTarget, type Vehicle } from './state'

export const rentalTargets = (renewalMap?.data.interactions.construction ?? [])
  .filter(site => site.id.startsWith('mobility-'))
  .flatMap(site => (Object.keys(vehicles) as Vehicle[]).map(vehicle => {
    const side = vehicles[vehicle].side * RENTAL_PAIR_SPACING / 2
    const dx = side * Math.cos(site.yaw), dz = -side * Math.sin(site.yaw)
    return {
      stationId: site.id, vehicle, radius: site.radius, heightTolerance: site.heightTolerance,
      reach: { x: site.reachPosition[0] + dx, y: site.reachPosition[1], z: site.reachPosition[2] + dz },
      center: { x: site.position[0] + dx, y: site.position[1], z: site.position[2] + dz },
    }
  }))

export function canReachRental(position: { x: number; y: number; z: number }, target: RentalTarget) {
  return Math.hypot(position.x - target.reach.x, position.z - target.reach.z) <= target.radius
    && Math.abs(position.y - target.reach.y) <= target.heightTolerance
}

export function aimAtRental(position: { x: number; y: number; z: number }) {
  const direction = readInteractionDirection()
  if (!direction) return null
  const aim = { ...interactionAim, ...direction }
  let best = 4, selected: RentalTarget | null = null
  for (const target of rentalTargets) {
    if (!canReachRental(position, target)) continue
    const distance = Math.hypot(position.x - target.reach.x, position.z - target.reach.z)
    const score = interactionScore(distance, { ...target.center, y: target.center.y + 1 }, aim)
    if (score < best) { best = score; selected = target }
  }
  return selected
}
