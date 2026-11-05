import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useGame, recoveryBlocked } from './store'
import { estimatedServerTime, useSession } from '../network/worldClient'
import { gameTurnCue, sharedTurnNoticeMemory, type TurnCue } from './turnNotice'

export function GameTurnNotice() {
  const state = useGame(s => s), connected = useSession(s => s.status === 'connected')
  const viewer = useSession(s => s.sessionId), names = useSession(s => s.profiles)
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || !document.hidden)
  const [notice, setNotice] = useState<TurnCue | null>(null)
  const cue = gameTurnCue(state.game, viewer, names, estimatedServerTime())
  const enabled = visible && connected && !state.uncertain && !!state.game && (state.game.role === 'SPECTATOR'
    ? state.watchedGameId === state.game.gameId : !recoveryBlocked() && state.game.version >= state.awaitingVersion)
  useEffect(() => {
    const change = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', change)
    return () => document.removeEventListener('visibilitychange', change)
  }, [])
  useEffect(() => {
    if (!cue || !enabled) { setNotice(null); return }
    if (!sharedTurnNoticeMemory.consume(cue)) return
    setNotice(cue)
    // Nickname/snapshot changes within the same turn do not restart the animation.
  }, [cue?.key, enabled])
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 1500)
    return () => clearTimeout(timer)
  }, [notice])
  const content = notice && <div key={notice.key} className="game-turn-notice" data-own={notice.own} role="status" aria-live="polite">
    <strong>{notice.text}</strong><small>{notice.hint}</small>
  </div>
  // Only the presentation moves into the park. The observer itself stays mounted beside HudLayer.
  const host = typeof document === 'undefined' ? null : document.querySelector?.('.park-page')
  return host ? createPortal(content, host) : content
}
