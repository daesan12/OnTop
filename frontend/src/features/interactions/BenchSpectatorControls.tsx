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
  const seat = useBenchState(s => s.placements[session.sessionId]?.seat ?? -1)
  const scope = benchViewScope(session, seat), anchor = benchTable(session.benchId)
  useEffect(() => { resetBenchSpectator(); return resetBenchSpectator }, [scope])
  if (!scope || !anchor || !session.mapCompatible) return null
  const binding = session.bindings.find(b => b.channelId === session.roomId && b.anchorId === anchor.id)
  const change = async (next: typeof view) => {
    if (next === 'seated' && watching && !await runtime.unwatchGame()) return
    if (benchViewScope(useSession.getState()) !== scope) return
    benchLook.yaw = Math.PI / 4
    useBenchSpectator.setState({ scope, view: next })
    useTableLobby.setState({ spectatorView: next === 'board' ? 'board' : 'table' })
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
      <details className="bench-spectator-help"><summary onKeyDown={event => {
        if (event.code !== 'F1') event.stopPropagation()
      }}>관전 안내</summary><div>
        <small>관전 전용 · 참가 좌석을 차지하지 않아요. 우클릭 드래그로 참가자 주위를 둘러봐요.</small>
        {!watching && <button type="button" disabled={!binding || session.pending || busy}
          onClick={() => runtime.inspectTable(anchor.id)}>테이블 공개 정보</button>}
        {!watching && <small>게임 진행 내용은 서버의 공개 경기 연결이 준비되면 표시됩니다.</small>}
        {watching && <button type="button" disabled={session.pending || busy} onClick={() => void runtime.unwatchGame()}>공개 경기 연결 종료</button>}
        {error && <small role="alert">{error}</small>}
      </div></details>
    </>}
  </div>
}
