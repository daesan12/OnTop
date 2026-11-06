import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import CoopHost from '../../../src/features/skewer/coop/CoopHost'
import { ChefPreview } from '../../../src/features/skewer/chef/model'
import { HallPreview } from '../../../src/features/skewer/serviceHall/previewModel'
import type { CoopSnapshot, CoopTransport } from '../../../src/features/skewer/coop/contracts'

// UI-only transport. Test routes replace the GPU scenes, not CoopHost or its native dialog.
const role = new URLSearchParams(location.search).get('role') === 'server' ? 'server' : 'chef'
const waiting = new URLSearchParams(location.search).get('phase') === 'WAITING'
const snapshot: CoopSnapshot = {
  gameId: 'skewer-coop-00000000-0000-4000-8000-000000000001', version: 1, registered: !waiting,
  publicState: { gameCode: 'SKEWER_COOP', phase: waiting ? 'WAITING' : 'PLAYING', channelId: 'park', actionVersion: 0,
    round: 0, restart: null, remaining: 180, elapsed: 60, countdown: 0, score: 420, served: 3,
    paused: false, pauseReason: '', pausedBy: [], rankingEligible: false, chefVR: false, entryFee: 0,
    rewardStatus: 'SERVER_SETTLEMENT', message: '', endReason: null,
    players: [{ userId: '101', role, ready: !waiting, connected: true },
      { userId: '202', role: role === 'chef' ? 'server' : 'chef', ready: !waiting, connected: true }],
    greeting: { active: false, index: 0, remaining: 5, answered: false, responded: 0, speech: false } },
  privateState: role === 'chef' ? { role, chef: new ChefPreview().view() } : { role, hall: new HallPreview().view() },
}
let listener: Parameters<CoopTransport['subscribe']>[0] = () => false
const events = new EventTarget()
let leaveRequests = 0, forfeits = 0
const notifyRequests = () => events.dispatchEvent(new Event('requests'))
const publish = () => {
  snapshot.version++
  listener({ type: 'GAME_STATE', payload: structuredClone(snapshot) } as never)
}
function ask(own = false) {
  const id = String(snapshot.version)
  snapshot.publicState.restart = { id, requestedBy: own ? '101' : '202', expiresAt: Date.now() + 15000 }
  snapshot.publicState.paused = true; snapshot.publicState.pauseReason = 'RESTART_CONFIRM'
  publish()
  setTimeout(() => { if (snapshot.publicState.restart?.id === id) { clearRequest(); publish() } }, 15000)
}
function clearRequest() {
  snapshot.publicState.restart = null; snapshot.publicState.paused = false; snapshot.publicState.pauseReason = ''
}
const transport: CoopTransport = {
  scope: () => ({ userId: '101', channelId: 'park', connected: true }),
  subscribe: fn => { listener = fn; return () => { listener = () => false } },
  requestJSON: async path => {
    if (path.endsWith('/leave')) { leaveRequests++; notifyRequests() }
    return { mine: structuredClone(snapshot), rooms: [] }
  },
  request: async (type, payload) => {
    if (type === 'GAME_FORFEIT') { forfeits++; notifyRequests() }
    if (type === 'GAME_ACTION_SEND') {
      const input = payload.input as Record<string, unknown>
      if (input.type === 'CHEF_MODE') snapshot.publicState.chefVR = input.vr === true
      if (input.type === 'READY') snapshot.publicState.players[0]!.ready = input.ready === true
      if (input.type === 'RESTART_REPLY' && input.requestId === snapshot.publicState.restart?.id) {
        events.dispatchEvent(new CustomEvent('reply', { detail: input.accept ? '동의 전송' : '거절 전송' }))
        clearRequest()
      }
      publish()
    }
    return { type: type === 'GAME_STATE_CHECK' ? 'GAME_STATE' : 'GAME_ACTION_RESULT', payload: structuredClone(snapshot) } as never
  },
}
function App() {
  const [closed, setClosed] = useState(false)
  const [reply, setReply] = useState('응답 없음')
  const [requests, setRequests] = useState({ leave: 0, forfeit: 0 })
  useEffect(() => {
    const receive = (event: Event) => setReply((event as CustomEvent<string>).detail)
    events.addEventListener('reply', receive); return () => events.removeEventListener('reply', receive)
  }, [])
  useEffect(() => {
    const receive = () => setRequests({ leave: leaveRequests, forfeit: forfeits })
    events.addEventListener('requests', receive); return () => events.removeEventListener('requests', receive)
  }, [])
  return <>
    <nav style={{ position: 'fixed', zIndex: 10000, top: 8, left: 8 }} aria-label="검수 시나리오">
      <button onClick={() => ask()}>친구 재시작 요청</button>
      <button onClick={() => ask(true)}>내 재시작 요청</button>
      <output aria-label="재시작 응답">{reply}</output>
      <output aria-label="방 퇴장 요청">{requests.leave}</output>
      <output aria-label="기권 요청">{requests.forfeit}</output>
      {waiting ? ['COUNTDOWN', 'PLAYING', 'FINISHED'].map(phase => <button key={phase} onClick={() => {
        snapshot.publicState.phase = phase as CoopSnapshot['publicState']['phase']; snapshot.registered = true; publish()
      }}>{phase} 전환</button>) : null}
    </nav>
    {closed ? <main aria-label="일반 공원 복귀">일반 공원으로 돌아왔어요.</main> : <CoopHost transport={transport} onClose={() => setClosed(true)} />}
  </>
}
createRoot(document.getElementById('root')!).render(<App />)
