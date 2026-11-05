import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from 'zustand'
import { createPortal } from 'react-dom'
import type { CoopTransport } from './contracts'
import { CoopClient } from './client'
import { OnlineChef, OnlineHall } from './drivers'
import { CoopResultPanel } from './CoopResultPanel'
import { CoopLobby } from './CoopLobby'
import { ExitConfirmation } from '../ExitConfirmation'
import { GreetingEvent, GREETING_IMAGE } from './GreetingEvent'
import { useGameDragScroll } from '../useGameDragScroll'
import { cooperativeSkewerGameplayActive, setCooperativeSkewerActivity } from '../activity'
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
  const hall = useMemo(() => new OnlineHall(client), [client]), chef = useMemo(() => new OnlineChef(client), [client])
  const [confirmExit, setConfirmExit] = useState(false), [leaving, setLeaving] = useState(false)
  const [pausePending, setPausePending] = useState(false)
  const pauseBusy = useRef(false)
  const [equipmentOpen, setEquipmentOpen] = useState(false)
  const [chefMode, setChefMode] = useState<'pc' | 'vr' | null>(null)
  useEffect(() => { client.start(); return () => client.stop() }, [client])
  useEffect(() => {
    setCooperativeSkewerActivity(cooperativeSkewerGameplayActive(pub?.phase))
    return () => setCooperativeSkewerActivity(false)
  }, [pub?.phase])
  useEffect(() => { const image = new Image(); image.src = GREETING_IMAGE }, [])
  useEffect(() => {
    const greet = (event: KeyboardEvent) => {
      if (event.code === 'KeyG' && !event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey
        && !(event.target instanceof Element && event.target.closest('input,textarea,[contenteditable=true]'))
        && !client.inputBlocked && !client.snapshot?.publicState.paused
        && client.snapshot?.publicState.greeting.active && !client.snapshot.publicState.greeting.answered) {
        event.preventDefault(); void client.act({ type: 'GREET' })
      }
    }
    window.addEventListener('keydown', greet); return () => window.removeEventListener('keydown', greet)
  }, [client])
  const changePause = async (paused: boolean) => {
    if (pauseBusy.current || leaving) return
    pauseBusy.current = true; setPausePending(true); client.inputBlocked = true
    if (paused) setConfirmExit(true)
    try {
      await client.act({ type: 'PAUSE', paused })
      const ownPause = client.snapshot?.publicState.pausedBy?.includes(transport.scope().userId) ?? false
      if (!paused && !ownPause) { client.inputBlocked = false; setConfirmExit(false) }
    } finally { pauseBusy.current = false; setPausePending(false) }
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
    if (leaving) return
    setLeaving(true)
    try { await client.leave(); client.stop(); onClose() }
    catch { client.store.setState({ error: '퇴장을 확인하지 못했어요. 연결을 확인하고 다시 시도해주세요.' }) }
    finally { setLeaving(false) }
  }
  const xr = (active: boolean) => { if (active) { setEquipmentOpen(false); setChefMode('vr') }; if (client.snapshot?.privateState.role === 'chef' && client.snapshot.publicState.phase !== 'FINISHED') void client.act({ type: 'CHEF_MODE', vr: active }) }
  return createPortal(<div className="skewer-coop" data-testid="skewer-coop" data-role={role || undefined} data-phase={pub?.phase ?? 'ROOMS'} data-version={snapshot?.version}>
    <Suspense fallback={<p className="coop-loading" role="status">가게를 준비하고 있어요…</p>}>
      {role === 'server' ? <Hall driver={hall} inputBlocked={confirmExit || !!pub?.paused || !state.connected} /> : role === 'chef' ? <Chef driver={chef} preferredMode={chefMode ?? undefined} onXRChanged={xr} onExit={() => pub?.phase === 'FINISHED' ? void exit() : void changePause(true)} /> : <div className="coop-backdrop" />}
    </Suspense>
    {pub && pub.phase !== 'WAITING' && pub.phase !== 'FINISHED' ? <div className="coop-meta"><strong>2인 협동 · 무료 플레이</strong><span>{pub.rankingEligible ? 'VR 팀 랭킹 대상 · 정상 종료 시 등록' : 'PC 요리 · 팀 랭킹 미등록'}</span></div> : null}
    {!snapshot || pub?.phase === 'WAITING' ? equipmentOpen && role === 'chef'
      ? <div className="coop-equipment-return"><button onClick={() => setEquipmentOpen(false)}>← 역할·준비 화면으로</button><p>‘VR 시작’을 눌러 연결해 주세요.</p></div>
      : <CoopLobby client={client} chefMode={chefMode} onChefMode={setChefMode} onClose={() => void exit()} onEquipment={() => setEquipmentOpen(true)} /> : null}
    {pub?.phase === 'COUNTDOWN' ? <div className="coop-countdown" role="status"><strong>{Math.max(1, Math.ceil(pub.countdown))}</strong><span>곧 영업을 시작해요</span></div> : null}
    {pub?.phase !== 'FINISHED' && (pub?.paused || !state.connected) && !confirmExit ? <div className="coop-pause" role="status"><strong>{pub?.pauseReason === 'EXIT_CONFIRM' && state.connected ? '친구가 잠시 쉬고 있어요' : '친구와 다시 연결하고 있어요'}</strong><p>{pub?.pauseReason === 'EXIT_CONFIRM' && state.connected ? '게임이 함께 멈췄어요. 친구가 돌아오면 이어서 진행해요.' : '영업 시간이 함께 멈췄어요. 30초 안에 돌아오면 이어서 진행해요.'}</p></div> : null}
    {pub?.greeting.active && !pub.paused && pub.phase === 'PLAYING' ? <GreetingEvent key={pub.greeting.index} greeting={pub.greeting} onGreet={() => client.act({ type: 'GREET' })} /> : null}
    {pub?.greeting.speech ? <div className="coop-speech" role="status">어서 오세요!</div> : null}
    {pub?.phase === 'FINISHED' ? <CoopResultPanel client={client} leaving={leaving} onClose={() => void exit()} /> : null}
    {state.error && pub && pub.phase !== 'FINISHED' && (pub.phase !== 'WAITING' || equipmentOpen) ? <p className="coop-error" role="alert">{state.error}</p> : null}
    <ExitConfirmation open={confirmExit} cooperative busy={pausePending || leaving} paused={!!pub?.paused}
      error={state.error} onContinue={() => void changePause(false)} onExit={() => void exit()} onRetry={() => void changePause(true)} />
  </div>, document.body)
}
