import { SIMPLE_MAP } from './mapRenderProfile'
import { PAVILION_LANTERN } from '../../config/parkPlan'
/** Original canopy dimensions; hangers adapt to the roof without changing it. */
export const PAVILION_CANOPY = {
  ceilingY: SIMPLE_MAP ? 3.45 : 4.17,
  ceilingHeight: SIMPLE_MAP ? 0.35 : 0.28,
  ceilingRadius: SIMPLE_MAP ? 4.3 : 3.8,
} as const
export const pavilionCeilingBottom = PAVILION_CANOPY.ceilingY - PAVILION_CANOPY.ceilingHeight / 2
export function pavilionLanternY(p: { floor: number; scale: number }, size = 1) {
  return p.floor + Math.min(PAVILION_LANTERN.heightFactor * p.scale,
    pavilionCeilingBottom * p.scale - .968 * size - .32)
}
