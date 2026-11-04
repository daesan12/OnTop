import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Group, Mesh, MeshBasicMaterial, Vector3 } from 'three'
import { useSession } from '../../network/worldClient'
import { useChatTyping } from '../../features/chat/useChatTyping'
import { useParkRuntime } from '../../park/runtime/ParkRuntime'
import { useManual } from '../../features/manual/manualState'
import { setChatInputOpen, inputState } from '../../world/inputOwnership'
import { useGame } from '../store'
import { OMOK_FOCUS_LAYER, omokSpectatorFrame } from '../../world/omokCamera'
import { omokSpectatorViewport } from '../cameraState'
import { GOMOKU } from '../../config/gomoku'
import { OMOK_BOARD_ART_SPAN } from './boardLayout'
import { placeFloatingChats, type ChatRect } from './chatPlacement'
import chatIcon from '../../features/parkMenus/icons/chat-bubble.svg'
import sendIcon from '../../features/parkMenus/icons/chat-send.svg'
import { OMOK_HALF, OMOK_SPACING, omokCoordinate } from '../omokPresentation'
import { useOmokEvents, type DisplayEvent, type PingEvent } from './spectatorEvents'
import './omokFocus.css'

const labels = new Map<string, HTMLSpanElement>()
const chatHudSelectors='.omok-match-header,.omok-play-tools,.omok-play-notes,.omok-spectator-actions,.omok-ping-status,.focus-error,.omok-spectator-chat,.park-runtime-status,.game-hud-clock,.game-hud-menu'
export function OmokFeedback() {
  const chats = useOmokEvents(s => s.chats), pings = useOmokEvents(s => s.pings)
  const profiles = useSession(s => s.profiles), manual = useManual(s => s.open)
  const active = useGame(s => !s.lastResult && (s.game?.omok?.status === 'PLAYING' || s.game?.alkkagi?.status === 'PLAYING'))
  const gameCode = useGame(s => s.game?.omok?'OMOK':'ALKKAGI')
  const root=useRef<HTMLDivElement>(null), placements=useRef(new Map<string,ChatRect>())
  const gameId=useGame(s=>s.game?.gameId)
  const connectionNotice=useSession(s=>s.status+'\0'+s.error)
  const pingNotice=useOmokEvents(s=>String(s.pingSending)+'\0'+s.pingNotice+'\0'+s.pingError)
  useLayoutEffect(()=>{
    if(!active||gameCode!=='OMOK'||!root.current)return
    const overlay=root.current
    const measure=()=>{
      const area=overlay.getBoundingClientRect(),width=area.width,height=area.height
      const elements=[...overlay.querySelectorAll<HTMLElement>('.omok-floating-chat')]
      const blocked:ChatRect[]=[]
      const page=overlay.closest('.park-page')
      for(const node of page?.querySelectorAll<HTMLElement>(chatHudSelectors)??[]){
        const r=node.getBoundingClientRect()
        if(r.width&&r.height)blocked.push({left:r.left-area.left,top:r.top-area.top,right:r.right-area.left,bottom:r.bottom-area.top})
      }
      // Use the same measured frame as the game camera, including either seat orientation.
      if(omokSpectatorViewport.gameId===gameId){
        const insets=omokSpectatorViewport.insets,frame=omokSpectatorFrame(width,height,1,insets)
        const unitsPerPixel=frame.height*2*Math.tan(GOMOKU.topDownFov*Math.PI/360)/height
        const half=OMOK_BOARD_ART_SPAN/unitsPerPixel/2
        const cx=(insets.left+width-insets.right)/2,cy=(insets.top+height-insets.bottom)/2
        blocked.push({left:cx-half,top:cy-half,right:cx+half,bottom:cy+half})
      }else blocked.push({left:width*.25,top:height*.15,right:width*.75,bottom:height*.85})
      placements.current=placeFloatingChats(width,height,elements.map((node,i)=>({key:node.dataset.eventId!,width:node.offsetWidth,height:node.offsetHeight,slot:chats[i]?.slot??i})),blocked,placements.current)
      for(const node of elements){
        const rect=placements.current.get(node.dataset.eventId!)
        node.style.visibility=rect?'visible':'hidden'
        if(rect){node.style.left=rect.left+'px';node.style.top=rect.top+'px'}
      }
    }
    measure()
    const observer=new ResizeObserver(measure)
    observer.observe(overlay)
    for(const node of overlay.closest('.park-page')?.querySelectorAll(chatHudSelectors+',.omok-floating-chat')??[])observer.observe(node)
    window.addEventListener('resize',measure)
    return ()=>{observer.disconnect();window.removeEventListener('resize',measure)}
  },[active,gameCode,gameId,chats,manual,connectionNotice,pingNotice])
  if (!active) return null
  return <div ref={root} className="omok-feedback" data-game={gameCode} hidden={manual} aria-label="관전자 응원과 위치 추천">
    <div className="omok-chat-toasts" aria-label="최근 경기 채팅">{chats.map(chat => <div key={chat.eventId} data-event-id={chat.eventId} className={`omok-floating-chat slot-${chat.slot}`} role="status"
      style={{animationDelay: `${-Math.max(0, 3000 - (chat.until - performance.now()))}ms` } as CSSProperties}>
      <span>{chat.displayName ?? profiles[chat.senderUserId]?.nickname ?? '관전자'}</span> {chat.text}
    </div>)}</div>
    {pings.map(ping => <span className="omok-ping-label" key={ping.eventId} ref={element => {
      if (element) labels.set(ping.eventId, element); else labels.delete(ping.eventId)
    }}>{ping.displayName ?? profiles[ping.senderUserId]?.nickname ?? '관전자'} · {omokCoordinate(ping.x, ping.y)} 추천</span>)}
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
  const typing=useChatTyping(runtime,open&&canSend&&!sending)
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
    typing(false)
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
      {messages.map(message=><p key={message.eventId}><strong title={message.displayName??profiles[message.senderUserId]?.nickname??'관전자'}>{message.displayName??profiles[message.senderUserId]?.nickname??'관전자'}</strong><span>{message.text}</span></p>)}
    </div>
    <div id="omok-chat-body" className="omok-chat-body">
    <label htmlFor="omok-spectator-message"><img src={chatIcon} width="17" height="17" alt=""/>{player ? '경기 채팅' : '관전 채팅'}<small>이 경기만</small></label>
    <div><input id="omok-spectator-message" ref={input} value={draft} disabled={!canSend} readOnly={sending} aria-keyshortcuts="Enter" aria-label={player?'경기 채팅':omok?'관전 채팅 · 판을 눌러 위치 추천':'관전 채팅'}
      placeholder={canSend ? '이 경기 안에서만 대화해요' : player ? '경기 연결을 확인해주세요' : '관전 승인을 확인해주세요'} maxLength={400} autoComplete="off"
      onFocus={() => {setChatInputOpen(true);typing(!!draft.trim())}} onBlur={() => {setChatInputOpen(false);typing(false)}}
      onChange={event => { setDraft(event.target.value); setNotice('');typing(!!event.target.value.trim()) }}
      onKeyDown={event => { if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)) event.preventDefault() }} />
      <button type="submit" aria-label="보내기" title="메시지 보내기" disabled={!canSend || sending || !draft.trim()}><img src={sendIcon} width="17" height="17" alt=""/></button></div>
    <p role="status">{error || notice || (!player&&omok?'판 클릭으로 위치 추천 · Enter로 채팅':'Enter로 입력·전송 · Esc로 입력 종료')}</p></div>
  </form>
}
