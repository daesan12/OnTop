import { useSession } from '../../network/worldClient'
import { useDisplayGame } from '../../game/displayGame'
import { useTableLobby } from '../tableLobby/state'
import { winterBoardViewActive } from './boardView'

export function winterSceneryVisible() {
  return !winterBoardViewActive(useSession.getState(), useDisplayGame.getState(), useTableLobby.getState())
}

export function useWinterBoardView() {
  const table = useSession(s => !!(s.tableId || s.focusedAnchorId))
  const game = useDisplayGame(s => !!(s.game || s.watchedGameId))
  const lobby = useTableLobby(s => !!(s.joiningAnchorId || s.spectatorRequested))
  return table || game || lobby
}
