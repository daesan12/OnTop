import { create } from 'zustand'
import type { ChessMove } from './protocol'

const initial = () => ({ gameId: '', version: -1, connected: false, looking: false, selected: '',
  promotion: [] as ChessMove[], claimMode: false, flip: false, angle: 0, overhead: false, keyboardOpen: false })
export const useChessUI = create(initial)

/** A second HUD/world consumer mounting during recovery must preserve the user's current selection/view. */
export function syncChessUI(gameId: string, version: number, connected: boolean, looking: boolean) {
  const current = useChessUI.getState()
  if (current.gameId !== gameId) useChessUI.setState({ ...initial(), gameId, version, connected, looking })
  else if (current.version !== version || current.connected !== connected || current.looking !== looking)
    useChessUI.setState({ version, connected, looking, selected: '', promotion: [], claimMode: false })
}
