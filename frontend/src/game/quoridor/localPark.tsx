import { useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { exchangeCallbackCode } from '../../auth/authFlow'
import { ParkPage } from '../../park/ParkPage'
import { parkRuntime } from '../../park/runtime/runtime'
import { useSession, avatars } from '../../network/worldClient'
import { useGame } from '../store'
import '../../styles.css'

function LocalChannel() {
  const attempted = useRef(false)
  const room = useSession(s => s.roomId)
  const ready = useSession(s => s.status === 'connected' && !s.pending && s.mapCompatible && s.channels.some(c => c.channelId === 'channel-1'))
  useEffect(() => {
    if (room || !ready || attempted.current) return
    attempted.current = true
    void parkRuntime.selectChannel('channel-1')
  }, [room, ready])
  return null
}

async function boot() {
  if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname))
    throw new Error('로컬 검수 전용 화면입니다.')
  const role = new URLSearchParams(location.search).get('role') ?? 'red'
  const response = await fetch('/api/v1/dev/quoridor/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role }) })
  if (!response.ok) throw new Error('쿼리도 로컬 검수 서버 연결을 확인해주세요.')
  const { exchangeCode } = await response.json()
  location.hash = new URLSearchParams({ exchange_code: exchangeCode }).toString()
  await exchangeCallbackCode()
  // 기존 로컬 검수처럼 실제 runtime을 노출한다. 토큰·인증 정보를 노출하거나 서버 권한 검사를 우회하지 않는다.
  Object.assign(window, { quoridorParkTest: {
    state: () => {
      const game = useGame.getState(), world = useSession.getState()
      return { game: game.game, start: game.start, recovery: game.recovery, error: game.error, uncertain: game.uncertain,
        status: world.status, own: world.sessionId, roomId: world.roomId, tableId: world.tableId, sessionError: world.error,
        mapCompatible: world.mapCompatible, mapContractStatus: world.mapContractStatus,
        position: avatars.get(world.sessionId)?.current, bindings: world.bindings, table: world.tableStates[world.tableId] }
    },
    runtime: parkRuntime,
  } })
  createRoot(document.getElementById('root')!).render(<>
    <ParkPage onExit={async () => { await parkRuntime.stop(); location.reload() }} exitError=""
      onAuthEnded={() => location.reload()} onOperationBlocked={() => location.reload()} />
    <LocalChannel />
    <nav className="qr-local-notice" style={{ position: 'fixed', bottom: 4, right: 4, zIndex: 65, background: '#fff8df', color: '#163d29', fontSize: 12, padding: 6, borderRadius: 6 }}>
      로컬 검수 · 메모리 계정/재화 · <a href="?role=red">하나</a> · <a href="?role=green">둘</a> · <a href="?role=third">셋</a> · <a href="?role=fourth">넷</a> · <a href="?role=viewer">관전</a>
    </nav>
  </>)
}
void boot().catch(error => { document.getElementById('root')!.textContent = String(error) })
