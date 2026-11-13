import { useSession } from '../../network/worldClient'
import { useTableLobby } from '../tableLobby/state'
import { useCompanions } from './companions'

/** Only an authorized status response can complete NPC observation. */
export function syncPracticeSpectator() {
  const session = useSession.getState(), { observedPractice: practice, practiceChat } = useCompanions.getState()
  if (!useTableLobby.getState().spectatorRequested || session.status !== 'connected' || session.tableId || !session.watchedTableId
    || practiceChat?.role !== 'SPECTATOR' || !practice || practice.phase !== 'PLAYING'
    || practice.snapshot.gameId !== practiceChat.gameId || practice.snapshot.tableId !== session.watchedTableId) return
  useTableLobby.setState({ spectatorRequested: true, spectatorStatus: 'watching', spectatorError: '', panelOpen: false, entryNotice: null })
}
