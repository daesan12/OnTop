import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from 'zustand'
import { createPortal } from 'react-dom'
import type { CoopTransport } from './contracts'
import type { ChefVRConnection } from '../chef/ChefPage'
import { CoopClient } from './client'
import { OnlineChef, OnlineHall } from './drivers'
import { CoopResultPanel } from './CoopResultPanel'
import { CoopLobby } from './CoopLobby'
import { SKEWER_CHEF_VR_ENABLED } from './availability'
import { ExitConfirmation } from '../ExitConfirmation'
import { RestartConfirmation } from './RestartConfirmation'
import { GreetingEvent, GREETING_IMAGE, MISSED_GREETING_IMAGE } from './GreetingEvent'
import { useGameDragScroll } from '../useGameDragScroll'
import { cooperativeSkewerGameplayActive, setCooperativeSkewerActivity } from '../activity'
import { BusinessClosing, useBusinessClosing } from './BusinessClosing'
import './coop.css'
import './coopScreens.css'
import './coopPolish.css'

const Hall = lazy(() => import('../serviceHall/ServiceHallPage'))
const Chef = lazy(() => import('../chef/ChefPage'))
export default function CoopHost({ transport, onClose }: { transport: CoopTransport; onClose: () => void }) {
  useGameDragScroll('.skewer-coop')
  const [client] = useState(() => new CoopClient(transport))
  const state = useStore(client.store), snapshot = state.snapshot, pub = snapshot?.publicState
  const role = snapshot?.privateState.role
  const businessClosing = useBusinessClosing(`${snapshot?.gameId}:${pub?.round ?? 0}`, pub?.phase, pub?.endReason)
  const hall = useMemo(() => new OnlineHall(client), [client]), chef = useMemo(() => new OnlineChef(client), [client])
  const [confirmExit, setConfirmExit] = useState(false), [leaving, setLeaving] = useState(false)
  const leavingRef = useRef(false)
  const [pausePending, setPausePending] = useState(false)
  const pauseBusy = useRef(false)
  const restartBusy = useRef(false)
  const [restartPending, setRestartPending] = useState(false)
  const [equipmentOpen, setEquipmentOpen] = useState(false)
  const [connectingVR, setConnectingVR] = useState(false)
  const [chefVRConnection, setChefVRConnection] = useState<ChefVRConnection | null>(null)
  const [chefMode, setChefMode] = useState<'pc' | 'vr' | null>(null)
  const [xrActive, setXRActive] = useState(false)
  const wasXR = useRef(false)
  useEffect(() => { client.start(); return () => client.stop() }, [client])
  useEffect(() => { setChefMode(null); setEquipmentOpen(false) }, [snapshot?.gameId])
  useEffect(() => { setXRActive(false) }, [role])
  useEffect(() => {
    setCooperativeSkewerActivity(cooperativeSkewerGameplayActive(pub?.phase))
    return () => setCooperativeSkewerActivity(false)
  }, [pub?.phase])
  useEffect(() => { for (const src of [GREETING_IMAGE, MISSED_GREETING_IMAGE]) { const image = new Image(); image.src = src } }, [])
  useEffect(() => {
    const greet = (event: KeyboardEvent) => {
      if (event.code === 'KeyG' && !event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey
        && !(event.target instanceof Element && event.target.closest('input,textarea,[contenteditable=true]'))
        && !client.inputBlocked && !client.snapshot?.publicState.paused
        && !(role === 'chef' && chefMode === 'vr')
        && client.snapshot?.publicState.greeting.active && !client.snapshot.publicState.greeting.answered) {
        event.preventDefault(); void client.act({ type: 'GREET' })
      }
    }
    window.addEventListener('keydown', greet); return () => window.removeEventListener('keydown', greet)
  }, [client, role, chefMode])
  const changePause = async (paused: boolean) => {
    if (pauseBusy.current || leaving || client.snapshot?.publicState.restart) return
    pauseBusy.current = true; setPausePending(true); client.inputBlocked = true
    if (paused) setConfirmExit(true)
    try {
      await client.act({ type: 'PAUSE', paused })
      const ownPause = client.snapshot?.publicState.pausedBy?.includes(transport.scope().userId) ?? false
      if (!paused && !ownPause) { client.inputBlocked = false; setConfirmExit(false) }
    } finally { pauseBusy.current = false; setPausePending(false) }
  }
  const restart = async (accept?: boolean) => {
    if (restartBusy.current || leaving || !client.store.getState().connected) return
    const request = client.snapshot?.publicState.restart
    if (accept === undefined && (request || client.snapshot?.publicState.paused || confirmExit)) return
    if (accept !== undefined && (!request || request.requestedBy === transport.scope().userId)) return
    restartBusy.current = true; setRestartPending(true)
    try {
      await client.act(accept === undefined ? { type: 'RESTART_REQUEST' }
        : { type: 'RESTART_REPLY', requestId: request!.id, accept })
    } finally { restartBusy.current = false; setRestartPending(false) }
  }
  useEffect(() => {
    if (pub?.phase === 'FINISHED') { setConfirmExit(false); client.inputBlocked = false }
    else if (pub?.pausedBy?.includes(transport.scope().userId)) { setConfirmExit(true); client.inputBlocked = true }
  }, [pub?.phase, pub?.pausedBy, client, transport])
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.code !== 'Escape' || event.repeat || event.isComposing || confirmExit
        || !['PLAYING', 'COUNTDOWN'].includes(pub?.phase ?? '') || document.querySelector('dialog[open]')) return
      event.preventDefault(); event.stopImmediatePropagation(); void changePause(true)
    }
    window.addEventListener('keydown', escape, true)
    return () => window.removeEventListener('keydown', escape, true)
  })
  const exit = async () => {
    if (leavingRef.current) return
    leavingRef.current = true
    setLeaving(true)
    try { await client.leave(); client.stop(); onClose() }
    catch { client.store.setState({ error: '퇴장을 확인하지 못했어요. 연결을 확인하고 다시 시도해주세요.' }) }
    finally { leavingRef.current = false; setLeaving(false) }
  }
  const leaveLobby = async () => {
    if (!client.snapshot) { await exit(); return }
    if (client.snapshot.publicState.phase !== 'WAITING') return
    if (leaving || client.store.getState().pending) return
    setLeaving(true)
    try { await client.leave() }
    catch { client.store.setState({ error: '방을 나가지 못했어요. 다시 시도해 주세요.' }) }
    finally { setLeaving(false) }
  }
  const xr = (active: boolean) => {
    const ended = wasXR.current && !active
    wasXR.current = active
    setXRActive(active)
    if (ended) {
      // The scene retains its first callback; read the live snapshot after equipment checks.
      if (client.snapshot?.publicState.phase !== 'WAITING') { void exit(); return }
      setEquipmentOpen(false)
      if (client.snapshot.publicState.players.some(player => player.userId === transport.scope().userId && player.ready))
        void client.act({ type: 'READY', ready: false })
    }
    if (active) { setEquipmentOpen(false); setChefMode('vr') }
    if (client.snapshot?.privateState.role === 'chef' && client.snapshot.publicState.phase !== 'FINISHED') void client.act({ type: 'CHEF_MODE', vr: active })
  }
  const connectVR = () => {
    if (!chefVRConnection || xrActive || !state.connected) return
    setEquipmentOpen(true)
    setConnectingVR(true)
    // Invoke from the same click; WebXR requires a fresh user gesture.
    void chefVRConnection.start().finally(() => setConnectingVR(false))
  }
  return createPortal(<div className="skewer-coop" data-testid="skewer-coop" data-role={role || undefined} data-phase={pub?.phase ?? 'ROOMS'} data-version={snapshot?.version}>
    <Suspense fallback={<p className="coop-loading" role="status">가게를 준비하고 있어요…</p>}>
      {role === 'server' ? <Hall key={pub?.round ?? 0} driver={hall} inputBlocked={confirmExit || restartPending || !!pub?.paused || !state.connected} onPause={() => void changePause(true)} onRestart={() => void restart()} /> : role === 'chef' ? <Chef key={`${snapshot?.gameId}:chef`} driver={chef} onVRConnection={setChefVRConnection} inputBlocked={confirmExit || restartPending || !!pub?.paused || !state.connected} onRestart={() => void restart()} allowVR={SKEWER_CHEF_VR_ENABLED} preferredMode={chefMode ?? 'pc'} protectVR={transport.protectVR} onXRChanged={xr} onExit={() => pub?.phase === 'FINISHED' ? void exit() : void changePause(true)}
        pauseState={{ open: confirmExit, busy: pausePending || leaving, confirmed: !!pub?.pausedBy?.includes(transport.scope().userId), error: state.error }}
        onContinue={() => void changePause(false)} onLeave={() => void exit()} /> : <div className="coop-backdrop" />}
    </Suspense>
    {pub && pub.phase !== 'WAITING' && pub.phase !== 'FINISHED' ? <div className="coop-meta"><strong>2인 협동 · 무료 플레이</strong><span>{pub.rankingEligible ? `${pub.rankingMode ?? (pub.chefVR ? 'VR' : 'PC')} 팀 랭킹 대상 · 정상 종료 시 등록` : '방식 전환 · 팀 랭킹 미등록'}</span></div> : null}
    {!snapshot || pub?.phase === 'WAITING' ? equipmentOpen && role === 'chef'
      ? <div className="coop-equipment-return"><button disabled={connectingVR} onClick={() => setEquipmentOpen(false)}>← 역할·준비 화면으로</button><p role="status">{connectingVR ? '브라우저의 VR 실행 요청을 확인해 주세요.' : '‘VR 시작’을 눌러 헤드셋을 연결할 수 있어요.'}</p></div>
      : <CoopLobby key={snapshot?.gameId ?? 'browser'} client={client} chefMode={chefMode} onChefMode={setChefMode} onClose={() => void leaveLobby()} onEquipment={() => setEquipmentOpen(true)} onConnectVR={connectVR} canConnectVR={!!chefVRConnection && state.connected} /> : null}
    {pub?.phase === 'COUNTDOWN' ? <div className="coop-countdown" role="status"><strong>{Math.max(1, Math.ceil(pub.countdown))}</strong><span>곧 영업을 시작해요</span></div> : null}
    {!(role === 'chef' && xrActive) && pub?.phase !== 'FINISHED' && (pub?.paused || !state.connected) && !confirmExit && !pub?.restart ? <div className="coop-pause" role="status"><strong>{pub?.pauseReason === 'EXIT_CONFIRM' && state.connected ? '친구가 잠시 쉬고 있어요' : '친구와 다시 연결하고 있어요'}</strong><p>{pub?.pauseReason === 'EXIT_CONFIRM' && state.connected ? '게임이 함께 멈췄어요. 친구가 돌아오면 이어서 진행해요.' : '영업 시간이 함께 멈췄어요. 30초 안에 돌아오면 이어서 진행해요.'}</p></div> : null}
    {(pub?.greeting.active || !!pub?.greeting.outcome) && !pub.paused && pub.phase === 'PLAYING' && !(role === 'chef' && chefMode === 'vr') ? <GreetingEvent key={pub.greeting.index} greeting={pub.greeting} onGreet={() => client.act({ type: 'GREET' })} /> : null}
    {pub?.greeting.speech ? <div className="coop-speech" role="status">어서 오세요!</div> : null}
    {businessClosing ? <BusinessClosing /> : pub?.phase === 'FINISHED' ? <CoopResultPanel client={client} leaving={leaving} onClose={() => void exit()} /> : null}
    {!(role === 'chef' && xrActive) && state.error && pub && pub.phase !== 'FINISHED' && (pub.phase !== 'WAITING' || equipmentOpen) ? <p className="coop-error" role="alert">{state.error}</p> : null}
    {role === 'chef' && xrActive ? null : <ExitConfirmation open={confirmExit && !leaving} cooperative busy={pausePending || leaving} paused={!!pub?.paused}
      error={state.error} onContinue={() => void changePause(false)} onExit={() => void exit()} onRetry={() => void changePause(true)} />
    }

    {/* 몰입형 세션의 포커스를 DOM 모달로 가져오지 않는다. 세션 종료 시 남은 요청을 다시 표시한다. */}
    {role === 'chef' && xrActive ? null : <RestartConfirmation request={pub?.restart ?? null}
      own={pub?.restart?.requestedBy === transport.scope().userId}
      busy={restartPending || !state.connected} error={state.error} onReply={accept => void restart(accept)} />}
  </div>, document.body)
}
