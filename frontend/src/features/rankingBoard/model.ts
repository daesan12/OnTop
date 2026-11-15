import { create } from 'zustand'
import { PARK_DATA } from '../../map/park'
import { renewalMap } from '../../park/renewalMap'
import { clearRoamingInput } from '../../world/inputOwnership'

export const rankingBoardTarget = renewalMap?.data.interactions.rankingBoard ?? PARK_DATA.interactions.rankingBoard

export function canReachRankingBoard(position: { x: number; y: number; z: number }) {
  const target = rankingBoardTarget
  return [position.x, position.y, position.z].every(Number.isFinite)
    && Math.hypot(position.x - target.reachPosition[0], position.z - target.reachPosition[2]) <= target.radius
    && Math.abs(position.y - target.reachPosition[1]) <= target.heightTolerance
}

/** #288 only exposes the entry signal. The #290 modal consumes this state. */
export const useRankingBoardEntry = create<{ open: boolean }>(() => ({ open: false }))

export function openRankingBoard() {
  clearRoamingInput()
  useRankingBoardEntry.setState({ open: true })
}

export function closeRankingBoard() {
  useRankingBoardEntry.setState({ open: false })
}
