import { useEffect } from 'react'
import { useGame } from '../store'
import { useForfeit } from '../forfeit'
import { useSession } from '../../network/worldClient'
import { parkRuntime } from '../../park/runtime/runtime'
import { seatScope, useTableLobby } from '../../features/tableLobby/state'
import { panelOwnsKeys } from '../../world/inputOwnership'
import { canUseChess } from './actions'
import { chessCamera } from './camera'
import type { ChessMove } from './protocol'
import { syncChessUI, useChessUI } from './ui'
import { playSfx } from '../../audio/sfx'
import { chessSelectionSound } from './sound'
export { useChessUI } from './ui'

export const chessCoordinate = (index: number) => `${'abcdefgh'[index % 8]}${1 + Math.floor(index / 8)}`

/** The HUD and world mesh share presentation only. Every action still goes through the existing runtime grant. */
export function useChessControls() {
  const state = useGame(), session = useSession(), ui = useChessUI(), lobby = useTableLobby()
  useForfeit(s => s.attempt)
  const game = state.game?.chess ? state.game : null, c = game?.chess ?? null
  const player = game?.role === 'PLAYER', connected = session.status === 'connected' && session.mapCompatible
  const looking = player ? !!seatScope(session) && lobby.lookScope === seatScope(session) : lobby.spectatorView !== 'board'
  const canUse = connected && !session.pending && canUseChess(session.sessionId)
  const myTurn = canUse && c?.turnUserId === session.sessionId
  useEffect(() => {
    syncChessUI(game?.gameId ?? '', game?.version ?? -1, connected, looking)
  }, [game?.gameId, game?.version, connected, looking])
  const send = (move: ChessMove) => {
    if (!myTurn) return
    const kind = useChessUI.getState().claimMode ? 'claimDraw' as const : 'move' as const
    useChessUI.setState({ selected: '', promotion: [], keyboardOpen: false })
    void parkRuntime.actChess?.({ kind, from: move.from, to: move.to, ...(move.promotion ? { promotion: move.promotion } : {}) })
  }
  const choose = (index: number, keyboard = false) => {
    if (!c || c.status !== 'PLAYING' || looking || !connected || state.uncertain || (!keyboard && (!chessCamera.ready || panelOwnsKeys()))) return
    if (!player) { void parkRuntime.pingOmok(index % 8, Math.floor(index / 8)); return }
    if (!myTurn || ui.promotion.length) return
    const square = chessCoordinate(index), selected = useChessUI.getState().selected
    const matches = c.legalMoves.filter(move => move.from === selected && move.to === square)
    if (matches.length > 1) { useChessUI.setState({ promotion: matches, keyboardOpen: false }); return }
    if (matches.length === 1) { send(matches[0]); return }
    const nextSelected = c.legalMoves.some(move => move.from === square) ? square : ''
    const cue = chessSelectionSound(c, session.sessionId, selected, square)
    useChessUI.setState({ selected: nextSelected })
    if (cue) playSfx(cue)
  }
  return { state, session, game, c, ui, player, looking, connected, canUse, myTurn, choose, send,
    disabled: !connected || state.uncertain || looking || c?.status !== 'PLAYING' || !!ui.promotion.length || (player && !myTurn) }
}
