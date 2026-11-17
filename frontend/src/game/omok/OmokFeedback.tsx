import { useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Group, Mesh, MeshBasicMaterial, Vector3 } from 'three'
import { useSession } from '../../network/worldClient'
import { ParkChat } from '../../features/chat/ParkChat'
import { inputState } from '../../world/inputOwnership'
import { useManual } from '../../features/manual/manualState'
import { useParkXR } from '../../features/parkXR/state'
import { useDisplayGame as useGame } from '../displayGame'
import { OMOK_FOCUS_LAYER, omokSpectatorFrame } from '../../world/omokCamera'
import { omokSpectatorViewport } from '../cameraState'
import { GOMOKU } from '../../config/gomoku'
import { OMOK_BOARD_ART_SPAN } from './boardLayout'
import { placeFloatingChats, type ChatRect } from './chatPlacement'
import { OMOK_HALF, OMOK_SPACING, omokCoordinate } from '../omokPresentation'
import { useOmokEvents, type DisplayEvent, type PingEvent } from './spectatorEvents'
import './omokFocus.css'

const labels = new Map<string, HTMLSpanElement>()
const chatHudSelectors='.omok-match-header,.omok-play-tools,.omok-play-notes,.omok-spectator-actions,.omok-ping-status,.focus-error,.park-chat,.park-runtime-status,.game-hud-clock,.game-hud-menu'
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
  const inVR = useParkXR(s => s.phase === 'active')
  return <>{pings.filter(p => p.gameId === gameId).map(p => <Ping key={p.eventId} ping={p} focused={focused && !inVR} />)}</>
}

/** All games share the same Enter/send/Escape lifecycle and private game feed. */
export function SpectatorChat() { return <ParkChat /> }
