import { useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useSession } from '../../network/worldClient'
import { useParkRuntime } from '../../park/runtime/ParkRuntime'
import { useGame } from '../../game/store'
import { useTableLobby } from '../tableLobby/state'
import { benchLook, benchTable, benchViewScope, resetBenchSpectator, useBenchSpectator } from './benchSpectator'
import { useBenchState } from './benchState'

export function BenchSpectatorControls() {
  const runtime = useParkRuntime()
  const session = useSession(useShallow(s => ({ status: s.status, sessionId: s.sessionId, roomId: s.roomId,
    benchId: s.benchId, seatIndex: s.seatIndex, bindings: s.bindings, pending: s.pending, mapCompatible: s.mapCompatible })))
  const selectedView = useBenchSpectator(s => s.view), watching = useGame(s => s.watchedGameId)
  const publicView = useTableLobby(s => s.spectatorView)
  const view = watching && selectedView !== 'seated' ? publicView === 'board' ? 'board' : 'participants' : selectedView
  const busy = useGame(s => s.pending || s.uncertain)
  const error = useGame(s => s.error)
  const connection = useTableLobby(useShallow(s => ({ status: s.spectatorStatus, error: s.spectatorError || s.error })))
  const seat = useBenchState(s => s.placements[session.sessionId]?.seat ?? -1)
  const scope = benchViewScope(session, seat), anchor = benchTable(session.benchId)
  useEffect(() => {
    resetBenchSpectator()
    return () => {
      if (scope && useBenchSpectator.getState().scope === scope && useBenchSpectator.getState().view !== 'seated') runtime.closeTable()
      resetBenchSpectator()
    }
  }, [scope, runtime])
  if (!scope || !anchor || !session.mapCompatible) return null
  const binding = session.bindings.find(b => b.channelId === session.roomId && b.anchorId === anchor.id)
  const change = async (next: typeof view) => {
    if (next === 'seated' && !await runtime.unwatchGame()) return
    if (benchViewScope(useSession.getState()) !== scope) return
    benchLook.yaw = Math.PI / 4
    useBenchSpectator.setState({ scope, view: next })
    useTableLobby.setState({ spectatorView: next === 'board' ? 'board' : 'table' })
    if (next === 'seated') runtime.closeTable()
    else if (selectedView === 'seated') void runtime.watchBench(anchor.id)
    document.querySelector<HTMLCanvasElement>('canvas')?.focus({ preventScroll: true })
  }
  return <div className="bench-spectator" role="group" aria-label="벤치 관전">
    <button type="button" disabled={session.pending || busy} aria-pressed={view !== 'seated'} onClick={() => void change(view === 'seated' ? 'participants' : 'seated')}>
      {view === 'seated' ? '가까이 관전' : '벤치 시점'}</button>
    {view !== 'seated' && <>
      <div role="group" aria-label="벤치 관전 시점">
        <button type="button" aria-pressed={view === 'participants'} onClick={() => void change('participants')}>참가자와 함께 보기</button>
        <button type="button" aria-pressed={view === 'board'} onClick={() => void change('board')}>판 자세히 보기</button>
      </div>
      <span className="bench-watch-status" role={connection.error ? 'alert' : 'status'}>{connection.error || ({
        idle: '공개 경기 연결 대기', waiting: '진행 경기 시작 대기', starting: '경기 관전 연결 중…', watching: '공개 경기 관전 중',
        switching: '이전 관전 종료 확인 중…', error: '경기 관전을 다시 연결해주세요.',
      }[connection.status])}</span>
      <details className="bench-spectator-help"><summary onKeyDown={event => {
        if (event.code !== 'F1') event.stopPropagation()
      }}>관전 안내</summary><div>
        <small>관전 전용 · 참가 좌석을 차지하지 않아요. 우클릭 드래그로 참가자 주위를 둘러봐요.</small>
        {!watching && <button type="button" disabled={!binding || session.pending || busy}
          onClick={() => runtime.inspectTable(anchor.id)}>테이블 공개 정보</button>}
        {!watching && <small>진행 중인 공개 경기를 자동으로 연결합니다. 종료 후에는 다음 판을 기다려요.</small>}
        {(connection.error || connection.status === 'idle') && <button type="button" disabled={!binding || session.pending} onClick={() => void runtime.watchBench(anchor.id)}>경기 관전 다시 연결</button>}
        {watching && <button type="button" disabled={session.pending || busy} onClick={() => void runtime.unwatchGame()}>공개 경기 연결 종료</button>}
        {error && <small role="alert">{error}</small>}
      </div></details>
    </>}
  </div>
}
