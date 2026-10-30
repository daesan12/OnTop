import { useEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useSession } from '../../network/worldClient'
import { useParkRuntime } from '../../park/runtime/ParkRuntime'
import { useGame } from '../../game/store'
import { useTableLobby } from '../tableLobby/state'
import { publicMatchService } from '../tableLobby/publicMatch'
import { panelOwnsKeys } from '../../world/inputOwnership'
import { benchLook, benchTable, benchViewScope, resetBenchSpectator, useBenchSpectator } from './benchSpectator'
import { useBenchState } from './benchState'

export function BenchSpectatorControls() {
  const runtime = useParkRuntime()
  const changing = useRef(false)
  const session = useSession(useShallow(s => ({ status: s.status, sessionId: s.sessionId, roomId: s.roomId,
    benchId: s.benchId, pending: s.pending, mapCompatible: s.mapCompatible,
    watchedTableId: s.watchedTableId, tableStates: s.tableStates })))
  const selectedView = useBenchSpectator(s => s.view), watching = useGame(s => s.watchedGameId)
  const directHands = useGame(s => s.game?.role === 'SPECTATOR' && !!s.game.onecard)
  const publicView = useTableLobby(s => s.spectatorView)
  const view = watching && selectedView !== 'seated' ? publicView === 'board' ? 'board' : 'participants' : selectedView
  const busy = useGame(s => s.pending || s.uncertain)
  const error = useTableLobby(s => s.spectatorError || s.error)
  const bench = useBenchState(useShallow(s => ({ seat: s.placements[session.sessionId]?.seat ?? -1, pending: s.pending })))
  const scope = benchViewScope(session, bench.seat), anchor = benchTable(session.benchId)
  const anchorId = anchor?.id
  const available = !!publicMatchService.find({ channelId: session.roomId, tableId: session.watchedTableId })
  useEffect(() => {
    resetBenchSpectator()
    useBenchSpectator.setState({ scope })
    return () => {
      if (scope && useBenchSpectator.getState().scope === scope) runtime.closeTable()
      resetBenchSpectator()
    }
  }, [scope, runtime])
  // Subscribe to public table starts while seated; GAME_WATCH requires an explicit view change.
  useEffect(() => {
    if (scope && anchorId && session.mapCompatible && !bench.pending) void runtime.watchBench(anchorId, true)
  }, [scope, anchorId, session.mapCompatible, bench.pending, runtime])
  const disabled = session.pending || bench.pending || busy
  const change = async (next: typeof view) => {
    if (changing.current || disabled || !scope || !anchorId || !session.mapCompatible || next !== 'seated' && !available) return
    changing.current = true
    try {
      if (next === 'seated' ? !await runtime.unwatchGame() : !watching && !await runtime.watchBench(anchorId)) return
      if (benchViewScope(useSession.getState()) !== scope) return
      benchLook.yaw = Math.PI / 4
      useBenchSpectator.setState({ scope, view: next })
      useTableLobby.setState({ spectatorView: next === 'board' ? 'board' : 'table' })
      document.querySelector<HTMLCanvasElement>('canvas')?.focus({ preventScroll: true })
    } finally { changing.current = false }
  }
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (directHands || event.defaultPrevented || event.code !== 'Tab' || event.repeat || event.isComposing || event.ctrlKey || event.altKey || event.metaKey
        || !scope || !anchorId || !session.mapCompatible || panelOwnsKeys() || document.hidden) return
      const target = document.activeElement
      if (target instanceof HTMLElement && target.closest('input,textarea,select,a,[contenteditable="true"]')) return
      if (target instanceof HTMLElement && target.closest('button') && !target.closest('.bench-spectator')) return
      event.preventDefault()
      const views = ['seated', 'participants', 'board'] as const
      void change(views[(views.indexOf(view) + (event.shiftKey ? 2 : 1)) % views.length]!)
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  })
  if (!scope || !anchor || !session.mapCompatible || directHands) return null
  return <div className="bench-spectator" role="group" aria-label="벤치 관전" aria-keyshortcuts="Tab Shift+Tab">
    <button type="button" disabled={disabled || view === 'seated' && !available} aria-pressed={view !== 'seated'}
      onClick={() => void change(view === 'seated' ? 'participants' : 'seated')}>
      {view === 'seated' ? '가까이 관전' : '벤치 시점'}</button>
    {view !== 'seated' && <div role="group" aria-label="벤치 관전 시점">
      <button type="button" disabled={disabled || !available} aria-pressed={view === 'participants'} onClick={() => void change('participants')}>참가자와 함께 보기</button>
      <button type="button" disabled={disabled || !available} aria-pressed={view === 'board'} onClick={() => void change('board')}>판 자세히 보기</button>
    </div>}
    {error && <div className="bench-watch-error" role="alert">{error}
      <button type="button" disabled={disabled || !available} onClick={() => void change(view === 'seated' ? 'participants' : view)}>경기 관전 다시 연결</button>
    </div>}
  </div>
}
