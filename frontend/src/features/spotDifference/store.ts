import { create } from 'zustand'
import { useSession } from '../../network/worldClient'
import { rememberRoamingView } from '../../world/cameraReturn'
import { clearRoamingInput, inputState } from '../../world/inputOwnership'
import { useMouseLook } from '../../world/mouseLook'

export const useSpotDifference = create(() => ({ open: false }))

export function openSpotDifference() {
  const { sessionId, roomId } = useSession.getState()
  if (!sessionId || !roomId || inputState.minigameOpen) return
  if (useMouseLook.getState().active) rememberRoamingView(sessionId, roomId)
  clearRoamingInput()
  inputState.minigameOpen = true
  if (document.pointerLockElement) document.exitPointerLock()
  useSpotDifference.setState({ open: true })
}

export function closeSpotDifference() {
  if (!useSpotDifference.getState().open) return
  inputState.minigameOpen = false
  clearRoamingInput()
  useSpotDifference.setState({ open: false })
}
