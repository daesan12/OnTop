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

/** Player-style nickname and speech, anchored to the moving NPC. */
export function NpcSpeechBubble({actor,name,active=true,height=2.35,ambient}:{actor:PoliceNotice['actor'];name:string;active?:boolean;height?:number;ambient?:AmbientSpeech|null}) {
 const notices=useWorldAi(s=>s.police),notice=npcSpeech(notices,actor)
 const chatScope=useChatScope()
 const anchor=useRef<Group>(null),element=useRef<HTMLDivElement>(null)
 const [now,setNow]=useState(Date.now)
 const projection=useMemo(()=>new OverlayProjection(),[]),view=useMemo(()=>new OverlayView(),[]),point=useMemo(()=>new Vector3(),[])
 useEffect(()=>{
  const layer=document.querySelector('.avatar-overlays');if(!layer)return
  const el=document.createElement('div'),speech=document.createElement('div'),nickname=document.createElement('div')
  el.className='avatar-overhead';el.dataset.npcOverhead=actor;el.style.visibility='hidden';el.style.maxWidth='250px'
  speech.className='avatar-speech';speech.dataset.npcSpeech=actor;speech.hidden=true
  nickname.className='avatar-nickname npc-nickname';el.append(speech,nickname);layer.append(el);element.current=el
  return()=>{el.remove();element.current=null}
 },[actor])
 useEffect(()=>{const el=element.current;if(!el)return;const speech=el.firstElementChild as HTMLElement,current=Date.now()
  const actual=active&&notice&&notice.bubbleUntil>current&&(notice.gameId??'')===chatScope?notice:null
  const idle=!chatScope&&ambient&&ambient.expiresAt>current?ambient:null
  const text=actual?.speech??idle?.text??'',until=actual?.bubbleUntil??idle?.expiresAt??0
  speech.hidden=!text;speech.textContent=text
  if(el.lastElementChild)el.lastElementChild.textContent=name
  if(!until)return;const timer=setTimeout(()=>setNow(Date.now()),Math.max(1,until-current));return()=>clearTimeout(timer)
 },[active,notice,now,name,chatScope,ambient?.text,ambient?.expiresAt])
 useFrame(({camera,size})=>{
  const el=element.current,root=anchor.current;if(!el||!root)return
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
