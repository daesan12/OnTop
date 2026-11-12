import { create } from 'zustand'
import { useSession } from '../../network/worldClient'
import { rememberRoamingView } from '../../world/cameraReturn'
import { clearRoamingInput, focusParkCanvas, inputState } from '../../world/inputOwnership'
import { useMouseLook } from '../../world/mouseLook'

export const useParkJumpRope = create<{ owner: string }>(() => ({ owner: '' }))

export function openParkJumpRope() {
  const { sessionId, roomId } = useSession.getState()
  if (!sessionId || !roomId || inputState.minigameOpen) return
  if (useMouseLook.getState().active) rememberRoamingView(sessionId, roomId)
  inputState.minigameOpen = true
  clearRoamingInput()
  useParkJumpRope.setState({ owner: sessionId + ':' + roomId })
}

export function closeParkJumpRope() {
  if (!useParkJumpRope.getState().owner) return
  useParkJumpRope.setState({ owner: '' })
  inputState.minigameOpen = false
  clearRoamingInput()
  requestAnimationFrame(focusParkCanvas)
}
