import { tableScale as legacyScale, tableSeats as legacySeats } from '../config/table-seats'
import type { TableAnchor as LegacyAnchor } from '../config/world'

export interface TableAnchor extends LegacyAnchor {
  boardScale?: number
  boardOffsetY?: number
  seatSurfaceY?: number
  interactionPoints?: readonly LegacyAnchor['position'][]
}

export function tableScale(anchor: Pick<TableAnchor, 'pavilionId' | 'boardScale'>) {
  return anchor.boardScale ?? legacyScale(anchor)
}

export function tableSeats(anchor: Parameters<typeof legacySeats>[0] & Pick<TableAnchor, 'seatSurfaceY'>, count?: number) {
  const seats = legacySeats(anchor, count)
  return anchor.seatSurfaceY === undefined ? seats : seats.map(({ x, z }) => ({ x, z, yaw: Math.atan2(-x, -z) }))
}
