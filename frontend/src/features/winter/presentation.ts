import { useSession } from '../../network/worldClient'
import { useDisplayGame } from '../../game/displayGame'
import { useTableLobby } from '../tableLobby/state'
import { winterBoardViewActive, winterRoofSnowActive } from './boardView'
import { bungeoppangCookingView } from '../bungeoppang/bungeoppangView'

export function winterSceneryVisible() {
  return !winterBoardViewActive(useSession.getState(), useDisplayGame.getState(), useTableLobby.getState(),
    bungeoppangCookingView(performance.now()))
}

export function winterRoofSnowVisible() {
  return winterRoofSnowActive(useSession.getState(), useDisplayGame.getState(), useTableLobby.getState(),
    bungeoppangCookingView(performance.now()))
}

export function useWinterBoardView() {
  const table = useSession(s => !!(s.tableId || s.focusedAnchorId))
  const game = useDisplayGame(s => !!(s.game || s.watchedGameId))
  const lobby = useTableLobby(s => !!(s.joiningAnchorId || s.spectatorRequested))
  return table || game || lobby
}
