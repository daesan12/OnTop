import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ParkPage } from '../../park/ParkPage'
import { useSession } from '../../network/worldClient'
import { avatars } from '../../network/worldClient'
import { useGame } from '../store'
import { exchangeCallbackCode, getAuthSession } from '../../auth/authFlow'
import { parkRuntime } from '../../park/runtime/runtime'
import { roamingInput } from '../../world/inputOwnership'
import { useTableLobby } from '../../features/tableLobby/state'
import '../../styles.css'

function LocalControls() {
  const attempted = useRef(false), state = useSession(), playing = useGame(v => !!v.game)
  const [notice, setNotice] = useState('')
  useEffect(() => {
    if (attempted.current || state.roomId === 'channel-1' || state.status !== 'connected' || state.pending || !state.channels.length) return
    attempted.current = true; void parkRuntime.selectChannel('channel-1').then(ok => { if (!ok) attempted.current = false })
  }, [state.status, state.pending, state.roomId, state.channels.length])
  return <nav hidden={playing} aria-label="루미큐브 로컬 검수" style={{ position: 'fixed', bottom: 8, left: 8, zIndex: 80, padding: 10, background: '#fff2d6', color: '#203b2b', borderRadius: 8, maxWidth: '90vw' }}>
    <strong>루미큐브 · 테스트 계정 · 실제 DB/재화 없음</strong>
    <button disabled={!state.roomId || state.pending} onClick={() => { void nearTable().then(() => setNotice('기존 1번 보드게임 테이블 앞입니다.')).catch(() => setNotice('채널 입장 후 다시 시도하세요.')) }}>1번 테이블로 이동</button>
    <button disabled={!state.roomId} onClick={() => parkRuntime.inspectTable('table-1')}>1번 테이블 확인</button>
    <span>{notice}</span>
  </nav>
}
async function nearTable() {
  const auth = getAuthSession()
  if (auth?.status !== 'AUTHENTICATED') throw new Error('로컬 로그인 필요')
  const response = await fetch('/api/v1/local/rummikub/near-table', { method: 'POST', headers: { Authorization: `Bearer ${auth.accessToken}` } })
  if (!response.ok) throw new Error('채널 입장 필요')
}
async function boot() {
  if (!import.meta.env.DEV || !['127.0.0.1', 'localhost'].includes(location.hostname)) throw new Error('로컬 검수 전용입니다.')
  const role = new URLSearchParams(location.search).get('role') ?? 'red'
  const response = await fetch('/api/v1/local/rummikub/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role }) })
  if (!response.ok) throw new Error('루미큐브 로컬 서버 연결을 확인해주세요.')
  const { exchangeCode } = await response.json()
  location.hash = new URLSearchParams({ exchange_code: exchangeCode }).toString()
  await exchangeCallbackCode()
  // 이 개발 엔트리에서만 제공한다. 토큰과 비밀번호는 노출하지 않는다.
  Object.assign(window, { rummikubTest: {
    state: () => {
      const w = useSession.getState(), g = useGame.getState(), me = avatars.get(w.sessionId)
      return { ready: roamingInput.ready, own: w.sessionId, status: w.status, roomId: w.roomId, tableId: w.tableId, map: w.mapContractStatus,
        phase: g.start?.phase, game: g.game, recovery: g.recovery, permitted: g.permittedGameId,
        lobby: useTableLobby.getState(), result: g.result, error: g.error, sessionError: w.error, pending: g.pending, uncertain: g.uncertain,
        position: me ? { x: me.current.x, y: me.current.y, z: me.current.z } : null, table: w.tableStates[w.tableId] }
    },
    channel: () => parkRuntime.selectChannel('channel-1'),
    nearTable,
    inspect: () => parkRuntime.inspectTable('table-1'),
    join: () => parkRuntime.joinTable('table-1'),
    select: () => parkRuntime.selectGame('RUMMIKUB', 0),
    ready: () => parkRuntime.setReady(true),
    leave: () => parkRuntime.leaveTable(),
    act: (input: import('./protocol').RummikubInput) => parkRuntime.actRummikub?.(input),
    watch: (id: string) => parkRuntime.watchGame(id),
  } })
  createRoot(document.getElementById('root')!).render(<>
    <ParkPage onExit={async () => { await parkRuntime.stop(); location.reload() }} exitError=""
      onAuthEnded={() => location.reload()} onOperationBlocked={() => location.reload()}/><LocalControls/>
  </>)
}
void boot().catch(error => { document.getElementById('root')!.textContent = String(error) })
