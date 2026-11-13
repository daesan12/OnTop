import { useSession } from '../../network/worldClient'
import { useTableLobby } from '../tableLobby/state'
import { useCompanions } from './companions'
import { residentsEnabled } from './serviceFeatures'
import { resetBenchSpectator } from '../interactions/benchSpectator'
import { useGame } from '../../game/store'

export function observedNpcPractice() {
  const session = useSession.getState(), { observedPractice: practice, practiceChat } = useCompanions.getState()
  return residentsEnabled() && session.status === 'connected' && !session.tableId && !!session.watchedTableId
    && practiceChat?.role === 'SPECTATOR' && practice?.phase === 'PLAYING'
    && !practice.snapshot.endedAt && practice.snapshot.gameId === practiceChat.gameId && practice.snapshot.tableId === session.watchedTableId ? practice : null
}

/** Only an authorized status response can complete NPC observation. */
export function syncPracticeSpectator(previousGameId?: string) {
  if (!useTableLobby.getState().spectatorRequested || useGame.getState().watchedGameId) return
  const practice=observedNpcPractice()
  if (previousGameId && (!practice || practice.snapshot.gameId!==previousGameId)) {
    useTableLobby.setState({spectatorRequested:false,spectatorStatus:'idle',spectatorError:'',spectatorView:'table',entryNotice:null,panelOpen:false})
    resetBenchSpectator()
    return 'ended' as const
  }
  if (!practice) return
  useTableLobby.setState({ spectatorRequested: true, spectatorStatus: 'watching', spectatorError: '', panelOpen: false, entryNotice: null })
}
