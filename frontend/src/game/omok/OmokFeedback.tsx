import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Group, Mesh, MeshBasicMaterial, Vector3 } from 'three'
import { useSession } from '../../network/worldClient'
import { useParkRuntime } from '../../park/runtime/ParkRuntime'
import { useManual } from '../../features/manual/manualState'
import { setChatInputOpen, inputState } from '../../world/inputOwnership'
import { useGame } from '../store'
import { OMOK_FOCUS_LAYER } from '../../world/omokCamera'
import { OMOK_HALF, OMOK_SPACING, omokCoordinate } from '../omokPresentation'
import { useOmokEvents, type DisplayEvent, type PingEvent } from './spectatorEvents'
import './omokFocus.css'

const labels = new Map<string, HTMLSpanElement>()
export function OmokFeedback() {
  const chats = useOmokEvents(s => s.chats), pings = useOmokEvents(s => s.pings)
  const profiles = useSession(s => s.profiles), manual = useManual(s => s.open)
  const active = useGame(s => !s.lastResult && (s.game?.omok?.status === 'PLAYING' || s.game?.alkkagi?.status === 'PLAYING'))
  const gameCode = useGame(s => s.game?.omok?'OMOK':'ALKKAGI')
  if (!active) return null
  return <div className="omok-feedback" data-game={gameCode} hidden={manual} aria-label="관전자 응원과 위치 추천">
    <div className="omok-chat-toasts" aria-label="최근 경기 채팅">{chats.map(chat => <div key={chat.eventId} className={`omok-floating-chat slot-${chat.slot}`} role="status"
      style={{animationDelay: `${-Math.max(0, 3000 - (chat.until - performance.now()))}ms` } as CSSProperties}>
      <span>{profiles[chat.senderUserId]?.nickname ?? '관전자'}</span> {chat.text}
    </div>)}</div>
    {pings.map(ping => <span className="omok-ping-label" key={ping.eventId} ref={element => {
      if (element) labels.set(ping.eventId, element); else labels.delete(ping.eventId)
    }}>{profiles[ping.senderUserId]?.nickname ?? '관전자'} · {omokCoordinate(ping.x, ping.y)} 추천</span>)}
  </div>
}

function Ping({ ping, focused }: { ping: DisplayEvent<PingEvent>; focused: boolean }) {
  const root = useRef<Group>(null), wave = useRef<Mesh>(null), ringMaterial = useRef<MeshBasicMaterial>(null)
  const waveMaterial = useRef<MeshBasicMaterial>(null), point = useRef(new Vector3())
  const { gl } = useThree()
  const reduced = useRef(false)
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => { reduced.current = query.matches }; update()
    query.addEventListener('change', update); return () => query.removeEventListener('change', update)
  }, [])
  useFrame(({ camera }) => {
    if (!root.current) return
    const remaining = ping.until - performance.now(), age = 2000 - remaining
    root.current.visible = remaining > 0 && !inputState.manualOpen
    const fade = Math.min(1, Math.max(0, remaining / 450))
    if (ringMaterial.current) ringMaterial.current.opacity = fade * .9
    if (wave.current) {
      wave.current.visible = !reduced.current && age < 700
      wave.current.scale.setScalar(1 + Math.max(0, age) / 700)
    }
    if (waveMaterial.current) waveMaterial.current.opacity = Math.max(0, 1 - age / 700) * .6
    const label = labels.get(ping.eventId)
    if (label) {
      root.current.getWorldPosition(point.current); point.current.project(camera)
      const rect = gl.domElement.getBoundingClientRect()
      label.style.left = `${rect.left + (point.current.x + 1) / 2 * rect.width}px`
      label.style.top = `${rect.top + (1 - point.current.y) / 2 * rect.height - 22}px`
      label.style.opacity = String(point.current.z > 1 || !root.current.visible ? 0 : fade * .6)
    }
  })
  const layers = 1 << (focused ? OMOK_FOCUS_LAYER : 0)
  return <group ref={root} name={`omok-spectator-ping-${ping.eventId}`} position={[ping.x * OMOK_SPACING - OMOK_HALF, .047, ping.y * OMOK_SPACING - OMOK_HALF]}>
    <mesh rotation={[-Math.PI / 2, 0, 0]} layers-mask={layers} renderOrder={20} raycast={() => {}}>
      <ringGeometry args={[.037, .044, 4]} /><meshBasicMaterial ref={ringMaterial} color="#70d5b0" transparent depthWrite={false} depthTest={false} />
    </mesh>
    <mesh ref={wave} rotation={[-Math.PI / 2, 0, 0]} layers-mask={layers} renderOrder={19} raycast={() => {}}>
      <ringGeometry args={[.046, .049, 4]} /><meshBasicMaterial ref={waveMaterial} color="#70d5b0" transparent depthWrite={false} depthTest={false} />
    </mesh>
  </group>
}
export function OmokPings({ gameId, focused }: { gameId: string; focused: boolean }) {
  const pings = useOmokEvents(s => s.pings)
  return <>{pings.filter(p => p.gameId === gameId).map(p => <Ping key={p.eventId} ping={p} focused={focused} />)}</>
}

export function SpectatorChat() {
  const runtime = useParkRuntime(), canSend = useOmokEvents(s => s.canSend), sending = useOmokEvents(s => s.sending)
  const error = useOmokEvents(s => s.error), scope = useOmokEvents(s => s.scope)
  const [draft, setDraft] = useState(''), [notice, setNotice] = useState(''), [open, setOpen] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const log=useRef<HTMLDivElement>(null), followLatest=useRef(true)
  const history=useOmokEvents(s=>s.history), gameId=useGame(s=>s.game?.gameId)
  const profiles=useSession(s=>s.profiles)
  const messages=history.filter(message=>message.gameId===gameId)
  const player = useGame(s => s.game?.role === 'PLAYER')
  const omok = useGame(s => !!s.game?.omok)
  const compact = omok && !player
  useEffect(()=>{if(log.current&&followLatest.current)log.current.scrollTop=log.current.scrollHeight},[history,open])
  useEffect(() => { setDraft(''); setNotice(''); setOpen(false);followLatest.current=true; return () => setChatInputOpen(false) }, [scope])
  useEffect(() => { if (open) input.current?.focus() }, [open])
  useEffect(() => { if (!canSend) { input.current?.blur(); setChatInputOpen(false) } }, [canSend])
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.isComposing || event.keyCode === 229
        || event.ctrlKey || event.altKey || event.metaKey) return
      if (event.code === 'Escape' && document.activeElement === input.current) {
        event.preventDefault(); setOpen(false); input.current?.blur(); document.querySelector<HTMLCanvasElement>('canvas')?.focus(); return
      }
      if (event.code !== 'Enter' || !canSend || event.target === input.current
        || Object.entries(inputState).some(([panel, open]) => panel !== 'chatOpen' && open)
        || document.querySelector('dialog[open],[role="dialog"]')
        || event.target instanceof Element && event.target.closest('input,textarea,select,button,a,summary,[contenteditable="true"],[role="button"]')) return
      event.preventDefault(); setOpen(true); input.current?.focus()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [canSend])
  async function send(event: FormEvent) {
    event.preventDefault(); if (sending || !canSend) return
    const text = draft
    if (await runtime.sendSpectatorChat(text)) { setDraft(''); setNotice('전달 요청이 승인됐어요.'); }
  }
  return <form className="omok-spectator-chat" data-open={open} data-compact={compact} data-has-history={messages.length>0} onSubmit={event => void send(event)} aria-label={player ? '경기 채팅' : '관전 채팅'}>
    <button className="omok-chat-toggle" type="button" aria-expanded={open} aria-controls="omok-chat-body" onClick={() => {
      setOpen(!open)
      if (open) { input.current?.blur(); document.querySelector<HTMLCanvasElement>('canvas')?.focus() }
    }}>{open ? '채팅 닫기' : compact ? '관전 채팅 · Enter' : '경기 채팅 열기'}</button>
    <div className="omok-chat-log" role="log" aria-label="경기 채팅 기록" aria-live="polite" aria-relevant="additions" ref={log}
      onScroll={event=>{const e=event.currentTarget;followLatest.current=e.scrollHeight-e.scrollTop-e.clientHeight<24}}>
      {messages.map(message=><p key={message.eventId}><strong>{profiles[message.senderUserId]?.nickname??'관전자'}</strong><span>{message.text}</span></p>)}
    </div>
    <div id="omok-chat-body" className="omok-chat-body">
    <label htmlFor="omok-spectator-message">{player ? '경기 채팅' : omok ? '관전 채팅 · 판을 눌러 위치 추천' : '관전 채팅'}</label>
    <div><input id="omok-spectator-message" ref={input} value={draft} disabled={!canSend} readOnly={sending} aria-keyshortcuts="Enter"
      placeholder={canSend ? '이 경기에서 대화해요' : player ? '경기 연결을 확인해주세요' : '관전 승인을 확인해주세요'} maxLength={400}
      onFocus={() => setChatInputOpen(true)} onBlur={() => setChatInputOpen(false)}
      onChange={event => { setDraft(event.target.value); setNotice('') }}
      onKeyDown={event => { if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)) event.preventDefault() }} />
      <button type="submit" disabled={!canSend || sending || !draft.trim()}>보내기</button></div>
    <p role="status">{error || notice || 'Enter로 입력·전송 · Esc로 입력 종료'}</p></div>
  </form>
}
