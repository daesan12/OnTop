import { useEffect } from 'react'
import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import { useSession } from '../../network/worldClient'
import { seatScope, useTableLobby } from '../../features/tableLobby/state'
import { clearRoamingInput } from '../../world/inputOwnership'
import { useGame } from '../store'
import { useOmokEvents } from '../omok/spectatorEvents'
import type { Orientation, Wall } from './protocol'

export const useQuoridorUI = create(() => ({ gameId: '', version: -1, wallMode: false,
  orientation: 'HORIZONTAL' as Orientation, selected: null as Wall | null, hover: null as Wall | null }))

export function useQuoridorControls() {
  const state = useGame(useShallow(s => ({ game: s.game?.quoridor ? s.game : null, pending: s.pending, uncertain: s.uncertain,
    recovery: s.recovery, awaitingVersion: s.awaitingVersion, permitted: s.permittedGameId,
    watched: s.watchedGameId, error: s.error, result: s.result })))
  const session = useSession(useShallow(s => ({ sessionId: s.sessionId, tableId: s.tableId, seatIndex: s.seatIndex,
    connected: s.status === 'connected', pending: s.pending, mapCompatible: s.mapCompatible, profiles: s.profiles })))
  const look = useTableLobby(useShallow(s => ({ lookScope: s.lookScope, spectatorView: s.spectatorView })))
  const pingReady = useOmokEvents(s => s.canSend && !s.pingSending && !s.pingReadyAt)
  const ui = useQuoridorUI()
  const game = state.game, board = game?.quoridor, player = game?.role === 'PLAYER'
  const focused = player ? look.lookScope !== seatScope(session) : look.spectatorView === 'board'
  const playing = board?.status === 'PLAYING'
  const me = board?.players.find(p => p.userId === session.sessionId)
  const ready = session.connected && session.mapCompatible && !session.pending && !state.pending && !state.uncertain
    && !!game && game.version >= state.awaitingVersion
  const canAct = ready && focused && playing && player && !!me?.active && board?.turnUserId === session.sessionId
    && state.recovery === 'RESTORED' && state.permitted === game?.gameId
  const canPing = ready && focused && playing && !player && state.watched === game?.gameId && pingReady
  useEffect(() => {
    const current = useQuoridorUI.getState()
    if (current.gameId !== game?.gameId || current.version !== game?.version) {
      useQuoridorUI.setState({ gameId: game?.gameId ?? '', version: game?.version ?? -1, selected: null, hover: null,
        ...(current.gameId !== game?.gameId ? { wallMode: false, orientation: 'HORIZONTAL' as const } : {}) })
    }
  }, [game?.gameId, game?.version])
  useEffect(() => { if (game) clearRoamingInput() }, [game?.gameId])
  return { state, session, game, board, player, me, focused, playing, ready, canAct, canPing, ui }
}
