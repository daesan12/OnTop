import { GOMOKU, TABLES, tableScale } from '../../park/mapConfig'
import type { Pose } from '../../network/worldClient'
import {RENEWAL_PARK_ENABLED} from '../../park/mapSelection'
import {renewalInReach} from '../../park-renewal/runtime/placements'

/** Same existing table interaction radius for the E hint and explicit 3D clicks. */
export function canReachTable(position: Pick<Pose, 'x' | 'y' | 'z'> | undefined, anchorId: string) {
  if(RENEWAL_PARK_ENABLED)return renewalInReach('table',anchorId,position)
  const table = TABLES.find(table => table.id === anchorId)
  return !!position && !!table && [position.x, position.y, position.z].every(Number.isFinite)
    && Math.hypot(position.x - table.position[0], position.z - table.position[2]) <= GOMOKU.interactionRadius * tableScale(table)
    && Math.abs(position.y - table.position[1] - 0.8) <= 0.7
}
