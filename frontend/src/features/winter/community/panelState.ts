import { create } from 'zustand'
import { useSession } from '../../../network/worldClient'
import { clearRoamingInput, inputState } from '../../../world/inputOwnership'

export const useWinterCommunityPanel = create<{ kind: 'tree' | null; scope: string }>(() => ({ kind: null, scope: '' }))

export function openWinterCommunity(kind: 'tree') {
  const s = useSession.getState()
  clearRoamingInput(); inputState.minigameOpen = true
  if (document.pointerLockElement) document.exitPointerLock()
  useWinterCommunityPanel.setState({ kind, scope: `${s.sessionId}:${s.roomId}` })
  return true
}

export function closeWinterCommunity() {
  if (useWinterCommunityPanel.getState().kind) inputState.minigameOpen = false
  useWinterCommunityPanel.setState({ kind: null, scope: '' })
}
