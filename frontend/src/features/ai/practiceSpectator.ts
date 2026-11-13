import { useSession } from '../../network/worldClient'
import { useTableLobby } from '../tableLobby/state'
import { useCompanions } from './companions'
import { residentsEnabled } from './serviceFeatures'

export function observedNpcPractice() {
  const session = useSession.getState(), { observedPractice: practice, practiceChat } = useCompanions.getState()
  return residentsEnabled() && session.status === 'connected' && !session.tableId && !!session.watchedTableId
    && practiceChat?.role === 'SPECTATOR' && practice?.phase === 'PLAYING'
    && practice.snapshot.gameId === practiceChat.gameId && practice.snapshot.tableId === session.watchedTableId ? practice : null
}

/** Only an authorized status response can complete NPC observation. */
export function syncPracticeSpectator() {
  if (!useTableLobby.getState().spectatorRequested || !observedNpcPractice()) return
  useTableLobby.setState({ spectatorRequested: true, spectatorStatus: 'watching', spectatorError: '', panelOpen: false, entryNotice: null })
}
