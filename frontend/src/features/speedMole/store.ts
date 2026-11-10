import { create } from 'zustand'
import { clearRoamingInput, inputState } from '../../world/inputOwnership'

export const useSpeedMole = create<{ open: boolean }>(() => ({ open: false }))

/** Opening owns park input; the panel still waits for the server to approve a round. */
export function openSpeedMole() {
  if (useSpeedMole.getState().open) return
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
