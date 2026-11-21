import { useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { ParkPage } from '../../../park/ParkPage'
import { exchangeCallbackCode } from '../../../auth/authFlow'
import { parkRuntime } from '../../../park/runtime/runtime'
import { authoritativePose, useSession } from '../../../network/worldClient'
import { useGame } from '../../store'
import '../../../styles.css'

function LocalEntry() {
  const attempted = useRef(false)
  const room = useSession(s => s.roomId)
  const ready = useSession(s => s.status === 'connected' && !s.pending && s.mapCompatible && s.channels.some(c => c.channelId === 'channel-1'))
  useEffect(() => {
    if (attempted.current || room === 'channel-1' || !ready) return
    attempted.current = true
    void parkRuntime.selectChannel('channel-1')
  }, [room, ready])
  return null
}

async function boot() {
  if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('로컬 체스 검수 전용입니다.')
  const role = new URLSearchParams(location.search).get('role') ?? 'white'
  const response = await fetch('/api/v1/dev/chess/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role }) })
  if (!response.ok) throw new Error('체스 로컬 검수 서버 연결을 확인해주세요.')
  const { exchangeCode } = await response.json()
  location.hash = new URLSearchParams({ exchange_code: exchangeCode }).toString()
  await exchangeCallbackCode()
  Object.assign(window, { chessParkTest: {
    state: () => { const w = useSession.getState(), g = useGame.getState(); return { status: w.status, roomId: w.roomId,
      userId: w.sessionId, tableId: w.tableId, position: authoritativePose(w.sessionId), mapCompatible: w.mapCompatible,
      gameId: g.game?.gameId, chess: g.game?.chess, tables: w.tableStates, table: w.tableStates[w.tableId],
      phase: g.start?.phase, recovery: g.recovery, error: g.error, sessionError: w.error, result: g.result } },
    runtime: parkRuntime,
  } })
  createRoot(document.getElementById('root')!).render(<>
    <ParkPage onExit={async () => { await parkRuntime.stop(); location.reload() }} exitError="" onAuthEnded={() => location.reload()} onOperationBlocked={() => location.reload()} />
    <LocalEntry />
    <nav aria-label="체스 로컬 검수" style={{ position: 'fixed', bottom: 4, right: 6, zIndex: 59, background: '#fff8df', padding: '5px 9px', borderRadius: 8, fontSize: 12 }}>
      로컬 체스 · 계정·정산은 메모리 대역 · {role === 'white' ? '백 계정' : role === 'black' ? '흑 계정' : '관전 계정'}
    </nav>
  </>)
}
void boot().catch(error => { document.getElementById('root')!.textContent = String(error) })
