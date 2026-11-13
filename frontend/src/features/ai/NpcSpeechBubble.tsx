import {useEffect,useMemo,useRef,useState} from 'react'
import {useFrame} from '@react-three/fiber'
import {Group,Vector3} from 'three'
import {OverlayProjection,OverlayView} from '../../world/overlayProjection'
import {OMOK_FOCUS_LAYER} from '../../world/omokCamera'
import {avatars,useSession} from '../../network/worldClient'
import {OVERHEAD} from '../../park/mapConfig'
import {npcSpeech,useWorldAi,type PoliceNotice} from './worldAi'
import {useChatScope} from '../chat/gameChat'
import type {AmbientSpeech} from './ambientSpeech'
import type {ResidentKind} from './residentRig'
import './npcSpeechBubble.css'

/** NPC dialogue and idle nameplate, anchored to the moving NPC. */
export function NpcSpeechBubble({actor,name,kind,active=true,height=2.35,ambient}:{actor:PoliceNotice['actor'];name:string;kind:ResidentKind;active?:boolean;height?:number;ambient?:AmbientSpeech|null}) {
 const notices=useWorldAi(s=>s.police),notice=npcSpeech(notices,actor)
 const chatScope=useChatScope()
 const anchor=useRef<Group>(null)
 const overlay=useRef<{root:HTMLDivElement;bubble:HTMLDivElement;text:HTMLDivElement;label:HTMLSpanElement;nickname:HTMLDivElement}|null>(null)
 const [now,setNow]=useState(Date.now)
 const projection=useMemo(()=>new OverlayProjection(),[]),view=useMemo(()=>new OverlayView(),[]),point=useMemo(()=>new Vector3(),[])
 useEffect(()=>{
  const layer=document.querySelector('.avatar-overlays');if(!layer)return
  const root=document.createElement('div')
  const bubble=document.createElement('div')
  const portrait=document.createElement('span')
  const label=document.createElement('span')
  const text=document.createElement('div')
  const nickname=document.createElement('div')

  root.className='avatar-overhead npc-overhead'
  root.dataset.npcOverhead=actor
  root.style.visibility='hidden'
  bubble.className='npc-speech'
  bubble.dataset.npcSpeech=actor
  bubble.hidden=true
  portrait.className='npc-speech__portrait'
  portrait.setAttribute('aria-hidden','true')
  label.className='npc-speech__name'
  text.className='npc-speech__text'
  nickname.className='avatar-nickname npc-nickname'
  bubble.append(portrait,label,text)
  root.append(bubble,nickname)
  layer.append(root)
  overlay.current={root,bubble,text,label,nickname}
  return()=>{root.remove();overlay.current=null}
 },[actor])
 useEffect(()=>{
  const elements=overlay.current
  if(!elements)return
  elements.bubble.dataset.npcKind=kind
  elements.label.textContent=name
  elements.nickname.textContent=name
 },[actor,kind,name])
 useEffect(()=>{
  const elements=overlay.current
  if(!elements)return
  const current=Date.now()
  const actual=active&&notice&&notice.bubbleUntil>current&&(notice.gameId??'')===chatScope?notice:null
  const idle=!chatScope&&ambient&&ambient.expiresAt>current?ambient:null
  const text=actual?.speech??idle?.text??'',until=actual?.bubbleUntil??idle?.expiresAt??0
  elements.bubble.hidden=!text
  elements.nickname.hidden=!!text
  elements.text.textContent=text
  if(!until)return;const timer=setTimeout(()=>setNow(Date.now()),Math.max(1,until-current));return()=>clearTimeout(timer)
 },[actor,active,notice,now,chatScope,ambient?.text,ambient?.expiresAt])
 useFrame(({camera,size})=>{
  const el=overlay.current?.root,root=anchor.current;if(!el||!root)return
  root.updateWorldMatrix(true,false);root.getWorldPosition(point)
  const local=avatars.get(useSession.getState().sessionId)
  let visible=!!local&&root.parent?.visible!==false
    &&camera.layers.mask!==1<<OMOK_FOCUS_LAYER&&Math.hypot(point.x-local.current.x,point.z-local.current.z)<=OVERHEAD.maxDistance
  if(visible){camera.updateMatrixWorld();view.update(camera,size.width,size.height)
   const result=projection.project(root.matrixWorld,camera,view,el.offsetWidth,el.offsetHeight,0)
   visible=result.visible;if(visible)el.style.transform=result.transform
  }
  el.style.visibility=visible?'visible':'hidden'
 })
 return <group ref={anchor} position={[0,height,0]}/>
}
