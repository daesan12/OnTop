import type { Point3 } from '../../src/map/park/interactionData'
import type { RenewalRecreationAnchor } from '../../src/park/renewalMap'
import { ARCADE_SCALE } from '../assetSizing'
import { facilityBase, facilityYaw } from '../facilityPlacement'
import { groundSurfaceHeight } from '../groundSurface'
import { site } from '../plan'

export const ARCADE_CABINETS = {
  'rps-roulette-cabinet': [-6, .14, -3.6],
  'plus-minus-cabinet': [-2, .14, -3.6],
} as const

function worldPoint(id: string, x: number, z: number): Point3 {
  const building = site(id), yaw = facilityYaw(building)
  return [building.x + x * Math.cos(yaw) + z * Math.sin(yaw), facilityBase(id),
    building.z - x * Math.sin(yaw) + z * Math.cos(yaw)]
}

function reachPoint(position: Point3): Point3 {
  const [x, , z] = position
  return [x, groundSurfaceHeight(x, z) + .8, z]
}

export function buildRenewalRecreation() {
  const recreation: RenewalRecreationAnchor[] = [
    { id: 'fish-bread', position: worldPoint('bread', 0, 5.4), reachPosition: reachPoint(worldPoint('bread', 0, 6.4)), radius: 2.5 },
    { id: 'mole-shop', position: worldPoint('mole', 0, 3.5), reachPosition: reachPoint(worldPoint('mole', 0, 4.8)), radius: 2.3 },
  ]
  for (const id of ['rps-roulette-cabinet', 'plus-minus-cabinet'] as const) {
    const [x, , z] = ARCADE_CABINETS[id]
    const at = worldPoint('arcade', x * ARCADE_SCALE[0], z * ARCADE_SCALE[2])
    recreation.push({ id, position: at,
      reachPosition: reachPoint(worldPoint('arcade', x * ARCADE_SCALE[0], z * ARCADE_SCALE[2] + 1.25)), radius: 1.3 })
  }
  const [x, y, z] = reachPoint(worldPoint('vr', 0, 7.7))
  return { recreation, vrEntrance: { x, y, z, yaw: facilityYaw(site('vr')), radius: 2.8 } }
}
