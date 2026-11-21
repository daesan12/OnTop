import { useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { ParkPage } from '../park/ParkPage'
import { useSession } from '../network/worldClient'
import { parkRuntime } from '../park/runtime/runtime'
import { exchangeCallbackCode } from '../auth/authFlow'
import { useOntop } from '../features/ai/ontop'
import '../styles.css'

function Controls() {
  const attempted = useRef(false)
  const status = useSession(s => s.status), channel = useSession(s => s.roomId)
  const ready = useSession(s => !s.pending && s.mapContractStatus === 'verified' && s.channels.length > 0)
  const actor = useOntop(s => s.actor)
  useEffect(() => {
    if (!attempted.current && status === 'connected' && ready) {
      attempted.current = true
      if (channel !== 'channel-1') void parkRuntime.selectChannel('channel-1')
    }
  }, [status, ready, channel])
  return <nav aria-label="온탑 공원 로컬 검수" style={{ position: 'fixed', top: 70, left: 8, right: 8, zIndex: 65,
    background: '#fff8e8', color: '#183e30', border: '1px solid #bca771', borderRadius: 8, padding: 8, fontSize: 13 }}>
    <strong>온탑 공원 · 테스트 계정 · 실제 DB/외부 인증 미사용</strong>
    <span> · {actor ? '온탑: 광장 서쪽 눈더미 X=-5, Z=44 · 입구에서 광장 방향으로 이동 · Enter → /온탑' : '공원 연결 중'}</span>
  </nav>
}

async function boot() {
  if (!import.meta.env.DEV || !['127.0.0.1', 'localhost'].includes(location.hostname)) {
    throw new Error('로컬 검수 전용 화면입니다.')
  }
  const role = new URLSearchParams(location.search).get('role') ?? 'red'
  const response = await fetch('/api/v1/local/ontop/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role }) })
  if (!response.ok) throw new Error('온탑 공원 검수 서버 연결을 확인해주세요.')
  const { exchangeCode } = await response.json()
  location.hash = new URLSearchParams({ exchange_code: exchangeCode }).toString()
  await exchangeCallbackCode()
  createRoot(document.getElementById('root')!).render(<>
    <ParkPage onExit={async () => { await parkRuntime.stop(); location.reload() }} exitError=""
      onAuthEnded={() => location.reload()} onOperationBlocked={() => location.reload()} />
    <Controls />
  </>)
}
void boot().catch(error => { document.getElementById('root')!.textContent = String(error) })
