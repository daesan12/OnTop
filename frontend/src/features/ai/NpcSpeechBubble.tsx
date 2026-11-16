import {useEffect,useMemo,useRef,useState} from 'react'
import {useFrame} from '@react-three/fiber'
import {Group,Vector3} from 'three'
import {OverlayProjection} from '../../world/overlayProjection'
import {cameraOcclusion} from '../../world/cameraOcclusion'
import {OMOK_FOCUS_LAYER} from '../../world/omokCamera'
import {avatars,useSession} from '../../network/worldClient'
import {OVERHEAD} from '../../park/mapConfig'
import {npcSpeech,useWorldAi,type PoliceNotice} from './worldAi'
import {useChatScope} from '../chat/gameChat'
import type {AmbientSpeech} from './ambientSpeech'
import {npcFrameView} from './npcFrameView'
import {npcWallBlocksSpeech} from './npcSpeechOcclusion'
import type {ResidentKind} from './residentRig'
import {useJumpmap} from '../jumpmap/state'
import './npcSpeechBubble.css'

/** NPC dialogue and idle nameplate, anchored to the moving NPC. */
export function NpcSpeechBubble({actor,name,kind,active=true,height=2.35,ambient}:{actor:PoliceNotice['actor'];name:string;kind:ResidentKind;active?:boolean;height?:number;ambient?:AmbientSpeech|null}) {
 const notices=useWorldAi(s=>s.police),notice=npcSpeech(notices,actor)
 const chatScope=useChatScope()
 const jumping=useJumpmap(s=>s.run!==null)
 const anchor=useRef<Group>(null)
 const overlay=useRef<{root:HTMLDivElement;bubble:HTMLDivElement;text:HTMLDivElement;label:HTMLSpanElement;nickname:HTMLDivElement}|null>(null)
 const [now,setNow]=useState(Date.now)
 const projection=useMemo(()=>new OverlayProjection(),[]),point=useMemo(()=>new Vector3(),[])
 const layout=useRef({dirty:true,width:0,height:0,visible:false,transform:'',sightAt:-Infinity,blocked:false})
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
  const observer=new ResizeObserver(()=>{layout.current.dirty=true})
  observer.observe(root)
  layout.current={dirty:true,width:0,height:0,visible:false,transform:'',sightAt:-Infinity,blocked:false}
  return()=>{observer.disconnect();root.remove();overlay.current=null}
 },[actor])
 useEffect(()=>{
  const elements=overlay.current
  if(!elements)return
  elements.bubble.dataset.npcKind=kind
  elements.label.textContent=name
  elements.nickname.textContent=name
  layout.current.dirty=true
 },[actor,kind,name])
 useEffect(()=>{
  const elements=overlay.current
  if(!elements)return
  const current=Date.now()
  const actual=active&&notice&&notice.bubbleUntil>current&&(notice.gameId??'')===chatScope?notice:null
  const idle=!chatScope&&ambient&&ambient.expiresAt>current?ambient:null
  const text=jumping?'':actual?.speech??idle?.text??'',until=actual?.bubbleUntil??idle?.expiresAt??0
  elements.bubble.hidden=!text
  elements.nickname.hidden=!!text
  elements.text.textContent=text
  layout.current.dirty=true
  if(!until)return;const timer=setTimeout(()=>setNow(Date.now()),Math.max(1,until-current));return()=>clearTimeout(timer)
 },[actor,active,notice,now,chatScope,jumping,ambient?.text,ambient?.expiresAt])
 useFrame(({camera,size,clock})=>{
  const el=overlay.current?.root,root=anchor.current,box=layout.current
  if(!el||!root)return
  const local=avatars.get(useSession.getState().sessionId)
  let visible=false
  if(local&&root.parent?.visible!==false&&camera.layers.mask!==1<<OMOK_FOCUS_LAYER){
   root.getWorldPosition(point)
   const dx=point.x-local.current.x,dy=point.y-local.current.y,dz=point.z-local.current.z
   if(dx*dx+dy*dy+dz*dz<=OVERHEAD.maxDistance**2){
    if(box.dirty){
     box.width=el.offsetWidth
     box.height=el.offsetHeight
     box.dirty=false
    }
    const frame=npcFrameView(camera,size.width,size.height,clock.elapsedTime)
    const result=projection.project(root.matrixWorld,camera,frame.overlay,box.width,box.height,0)
    if (result.visible && clock.elapsedTime - box.sightAt >= .06) {
      box.sightAt = clock.elapsedTime
      box.blocked = npcWallBlocksSpeech(camera.position, point)
        || (cameraOcclusion.scenery?.sightBlocked(camera.position, point) ?? false)
    }
    visible=result.visible&&!box.blocked
    if(visible&&box.transform!==result.transform){
     box.transform=result.transform
     el.style.transform=result.transform
    }
   }
  }
  if(box.visible!==visible){
   box.visible=visible
   el.style.visibility=visible?'visible':'hidden'
  }
 },.75)
 return <group ref={anchor} position={[0,height,0]}/>
}
