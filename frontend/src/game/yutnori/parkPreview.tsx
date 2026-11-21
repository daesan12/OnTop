import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ParkPage } from '../../park/ParkPage'
import { useSession } from '../../network/worldClient'
import { parkRuntime } from '../../park/runtime/runtime'
import { exchangeCallbackCode, getAuthSession } from '../../auth/authFlow'
import '../../styles.css'

/** 기존 loopback fixture의 계정·실제 공원·서버 이동 검수 진입점. 운영 번들에서 사용하지 않는다. */
function LocalEntry() {
  const status = useSession(state => state.status)
  const room = useSession(state => state.roomId)
  const channels = useSession(state => state.channels)
  const verified = useSession(state => state.mapCompatible)
  const pending = useSession(state => state.pending)
  const selected = useRef(false)
  const placed = useRef(false)
  const [message, setMessage] = useState('테스트 계정으로 공원에 연결 중')
  const enter = async () => {
    const auth = getAuthSession()
    const response = await fetch('/local/yut/entrance', { method: 'POST', headers: { Authorization: `Bearer ${auth?.status === 'AUTHENTICATED' ? auth.accessToken : ''}` } })
    setMessage(response.ok ? '전통놀이존 입구 · E를 눌러 놀이 선택' : '공원에 연결한 뒤 다시 이동해주세요.')
  }
  useEffect(() => {
    if (!selected.current && room && room !== 'channel-1' && !pending && status === 'connected'
      && channels.some(channel => channel.channelId === 'channel-1')) {
      selected.current = true
      void parkRuntime.selectChannel('channel-1')
    }
  }, [status, room, channels, pending])
  useEffect(() => {
    if (room === 'channel-1' && verified && !pending && !placed.current) {
      placed.current = true
      void enter()
    }
  }, [room, verified, pending])
  return <nav className="yut-local-nav" aria-label="윷놀이 로컬 검수" style={{ position: 'fixed', left: 12, bottom: 12, zIndex: 80,
    maxWidth: 'calc(100% - 24px)', background: '#f4efde', color: '#264d3b', padding: 12, borderRadius: 10, fontSize: 14 }}>
    <strong>로컬 fixture · 실제 회원·DB·재화 미연결</strong><span role="status"> · {message}</span>
    <button onClick={() => void enter()} style={{ marginLeft: 10 }}>전통놀이존으로 이동</button>
  </nav>
}
async function boot() {
  if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('로컬 검수 전용 화면입니다.')
  const role = new URLSearchParams(location.search).get('role') ?? 'red'
  const response = await fetch('/local/yut/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role }) })
  if (!response.ok) throw new Error('기존 로컬 공원 fixture 서버 연결을 확인해주세요.')
  const { exchangeCode } = await response.json()
  location.hash = new URLSearchParams({ exchange_code: exchangeCode }).toString()
  await exchangeCallbackCode()
  createRoot(document.getElementById('root')!).render(<><ParkPage onExit={async () => { await parkRuntime.stop(); location.reload() }} exitError=""
    onAuthEnded={() => location.reload()} onOperationBlocked={() => location.reload()} /><LocalEntry /></>)
}
void boot().catch(error => { document.getElementById('root')!.textContent = String(error) })
