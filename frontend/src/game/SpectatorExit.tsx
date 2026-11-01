import { useEffect, useRef } from 'react'
import { useGame } from './store'
import { useTableLobby } from '../features/tableLobby/state'
import { useParkRuntime } from '../park/runtime/ParkRuntime'
import { inputState } from '../world/inputOwnership'
import { useSession } from '../network/worldClient'

/** One Escape owner for every board game, including finished or pending spectator views. */
export function SpectatorExit() {
  const runtime = useParkRuntime(), leaving = useRef(false)
  const watching = useGame(s => !!s.watchedGameId || s.game?.role === 'SPECTATOR')
  const requested = useTableLobby(s => s.spectatorRequested)
  useEffect(() => {
    if (!watching) return
    const cycle = (event: KeyboardEvent) => {
      const game = useGame.getState().game, session = useSession.getState()
      if (event.code !== 'Tab' || event.defaultPrevented || event.repeat || event.isComposing || event.keyCode === 229
        || event.ctrlKey || event.altKey || event.metaKey || document.hidden || game?.role !== 'SPECTATOR'
        || session.status !== 'connected' || session.pending || useGame.getState().pending
        || Object.values(inputState).some(Boolean) || document.querySelector('dialog[open],[role="dialog"],.park-chat[data-expanded="true"]')
        || event.target instanceof HTMLElement && event.target.closest('input,textarea,select,button,a,[contenteditable="true"]')) return
      // Seated spectators already cycle their three bench views in BenchSpectatorControls.
      if (session.benchId && !game.onecard) return
      event.preventDefault()
      useTableLobby.setState(s => ({ spectatorView: s.spectatorView === 'board' ? 'table' : 'board' }))
    }
    window.addEventListener('keydown', cycle)
    return () => window.removeEventListener('keydown', cycle)
  }, [watching])
  useEffect(() => {
    if (!watching && !requested) return
    const exit = (event: KeyboardEvent) => {
      if (event.code !== 'Escape' || event.defaultPrevented || event.repeat || event.isComposing || event.keyCode === 229
        || event.ctrlKey || event.altKey || event.metaKey || leaving.current || document.hidden
        || Object.values(inputState).some(Boolean) || document.querySelector('dialog[open],[role="dialog"],.park-chat[data-expanded="true"]')
        || event.target instanceof HTMLElement && event.target.closest('input,textarea,select,[contenteditable="true"]')) return
      event.preventDefault(); event.stopPropagation(); leaving.current = true
      void runtime.unwatchGame().finally(() => { leaving.current = false })
    }
    window.addEventListener('keydown', exit)
    return () => window.removeEventListener('keydown', exit)
  }, [watching, requested, runtime])
  return null
}
