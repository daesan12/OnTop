import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Group, Mesh, MeshBasicMaterial, Vector3 } from 'three'
import { useSession } from '../../network/worldClient'
import { useParkRuntime } from '../../park/runtime/ParkRuntime'
import { useManual } from '../../features/manual/manualState'
import { setChatInputOpen, inputState } from '../../world/inputOwnership'
import { useGame } from '../store'
import { OMOK_FOCUS_LAYER } from '../../world/omokCamera'
import { OMOK_HALF, OMOK_SPACING } from '../omokPresentation'
import { useOmokEvents, type DisplayEvent, type PingEvent } from './spectatorEvents'
import './omokFocus.css'

const labels = new Map<string, HTMLSpanElement>()
function chatPosition(chat: { eventId: string; slot: number }) {
  // Stable for this event across renders; subsequent messages use the whole overlay.
  let hash = 0
  for (const character of chat.eventId) hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0
  const horizontal = 5 + hash % 91
  return { left: `${horizontal}%`, top: `${18 + chat.slot * 19 + (hash >>> 8) % 12}%`,
    transform: `translateX(-${horizontal}%)` }
}
export function OmokFeedback() {
  const chats = useOmokEvents(s => s.chats), pings = useOmokEvents(s => s.pings)
  const profiles = useSession(s => s.profiles), manual = useManual(s => s.open)
  const active = useGame(s => !!s.game?.omok && s.game.omok.status === 'PLAYING')
  if (!active) return null
  return <div className="omok-feedback" hidden={manual} aria-label="관전자 응원과 위치 추천">
    {chats.map(chat => <div key={chat.eventId} className={`omok-floating-chat slot-${chat.slot}`} role="status"
      style={{ ...chatPosition(chat), animationDelay: `${-Math.max(0, 3000 - (chat.until - performance.now()))}ms` } as CSSProperties}>
      <span>{profiles[chat.senderUserId]?.nickname ?? '관전자'}</span> {chat.text}
    </div>)}
    {pings.map(ping => <span className="omok-ping-label" key={ping.eventId} ref={element => {
      if (element) labels.set(ping.eventId, element); else labels.delete(ping.eventId)
    }}>{profiles[ping.senderUserId]?.nickname ?? '관전자'} 추천</span>)}
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
      <ringGeometry args={[.036, .041, 40]} /><meshBasicMaterial ref={ringMaterial} color="#70d5b0" transparent depthWrite={false} depthTest={false} />
    </mesh>
    <mesh ref={wave} rotation={[-Math.PI / 2, 0, 0]} layers-mask={layers} renderOrder={19} raycast={() => {}}>
      <ringGeometry args={[.043, .045, 40]} /><meshBasicMaterial ref={waveMaterial} color="#70d5b0" transparent depthWrite={false} depthTest={false} />
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
  const [draft, setDraft] = useState(''), [notice, setNotice] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const player = useGame(s => s.game?.role === 'PLAYER')
  useEffect(() => { setDraft(''); setNotice(''); return () => setChatInputOpen(false) }, [scope])
  useEffect(() => { if (!canSend) { input.current?.blur(); setChatInputOpen(false) } }, [canSend])
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.isComposing || event.keyCode === 229
        || event.ctrlKey || event.altKey || event.metaKey) return
      if (event.code === 'Escape' && document.activeElement === input.current) {
        event.preventDefault(); input.current?.blur(); document.querySelector<HTMLCanvasElement>('canvas')?.focus(); return
      }
      if (event.code !== 'Enter' || !canSend || event.target === input.current
        || Object.entries(inputState).some(([panel, open]) => panel !== 'chatOpen' && open)
        || document.querySelector('dialog[open],[role="dialog"]')
        || event.target instanceof Element && event.target.closest('input,textarea,select,button,a,[contenteditable="true"],[role="button"]')) return
      event.preventDefault(); input.current?.focus()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [canSend])
  async function send(event: FormEvent) {
    event.preventDefault(); if (sending || !canSend) return
    const text = draft
    if (await runtime.sendSpectatorChat(text)) { setDraft(''); setNotice('전달 요청이 승인됐어요.'); }
  }
  return <form className="omok-spectator-chat" onSubmit={event => void send(event)} aria-label={player ? '오목 경기 채팅' : '오목 관전 채팅'}>
    <label htmlFor="omok-spectator-message">{player ? '경기 채팅' : '관전 채팅 · 판을 눌러 위치 추천'}</label>
    <div><input id="omok-spectator-message" ref={input} value={draft} disabled={!canSend} readOnly={sending} aria-keyshortcuts="Enter"
      placeholder={canSend ? '이 경기 관전자와 플레이어에게 보내기' : player ? '경기 연결 상태를 확인해주세요' : '관전 승인 상태를 확인해주세요'} maxLength={400}
      onFocus={() => setChatInputOpen(true)} onBlur={() => setChatInputOpen(false)}
      onChange={event => { setDraft(event.target.value); setNotice('') }}
      onKeyDown={event => { if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)) event.preventDefault() }} />
      <button type="submit" disabled={!canSend || sending || !draft.trim()}>보내기</button></div>
    <p role="status">{error || notice || 'Enter로 입력·전송 · Esc로 입력 종료'}</p>
  </form>
}
