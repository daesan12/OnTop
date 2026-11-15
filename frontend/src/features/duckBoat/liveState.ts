import { create } from 'zustand'
import type { Pose } from '../../network/worldClient'
import { clearRoamingInput, inputState } from '../../world/inputOwnership'

export interface LiveDuckBoat {
  userId: string
  pose: Pose
  remainingMs: number
}

export const useLiveDuckBoat = create<{ boat: LiveDuckBoat | null; modelReady: boolean }>(() => ({
  boat: null,
  modelReady: false,
}))

export function updateLiveDuckBoat(boat: LiveDuckBoat | null, userId = '') {
  const ownsControls = !!boat && boat.userId === userId
  if (inputState.duckBoat !== ownsControls) {
    inputState.duckBoat = ownsControls
    clearRoamingInput()
  }
  if (boat || useLiveDuckBoat.getState().boat) useLiveDuckBoat.setState({ boat })
}
