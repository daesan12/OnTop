import { create } from 'zustand'
import { clearRoamingInput, inputState } from '../../world/inputOwnership'
import { speedMoleTrialEnabled } from './trial'

export const useSpeedMole = create<{ open: boolean }>(() => ({ open: false }))

/** Trial scores stay in the mounted panel; no wallet, result or ranking API is called. */
export function openSpeedMole() {
  if (!speedMoleTrialEnabled() || useSpeedMole.getState().open) return
  clearRoamingInput()
  inputState.minigameOpen = true
  if (document.pointerLockElement) document.exitPointerLock()
  useSpeedMole.setState({ open: true })
}

export function closeSpeedMole() {
  if (!useSpeedMole.getState().open) return
  useSpeedMole.setState({ open: false })
  inputState.minigameOpen = false
  clearRoamingInput()
}
