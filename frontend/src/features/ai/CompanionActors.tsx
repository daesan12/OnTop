import {useRef,useEffect,useMemo} from 'react'
import {useFrame} from '@react-three/fiber'
import {Group} from 'three'
import {ResidentModel} from './ParkNpcModel'
import {useCompanions,type CompanionActor} from './companions'
import {NpcMotion} from './npcMotion'
import {NpcSpeechBubble} from './NpcSpeechBubble'
import {TABLES,tableSeats} from '../../park/mapConfig'
import {useSession} from '../../network/worldClient'
export function CompanionActors(){const actors=useCompanions(s=>s.actors);return <group>{actors.map(n=><Actor key={n.id} npc={n}/>)}</group>}
function Actor({npc}:{npc:CompanionActor}){
 const ref=useRef<Group>(null)
 const initial=useRef<[number,number,number]>([npc.x,npc.y,npc.z])
 const initialRotation=useRef<[number,number,number]>([0,npc.yaw??0,0]),motion=useRef(new NpcMotion()),speed=useRef(0),previous=useRef<[number,number,number]|null>(null)
 const received=useCompanions(s=>s.actorReceivedAt)
 const child=npc.persona==='CHILD',elder=npc.persona==='ELDER'||npc.role==='GUIDE'
 const kind=child?'CHILD':elder?'ELDER':'NEIGHBOR'
 const bindings=useSession(s=>s.bindings)
 const anchorId=npc.tableId&&bindings.find(binding=>binding.channelId===npc.channelId&&binding.tableId===npc.tableId)?.anchorId
 const table=anchorId?TABLES.find(anchor=>anchor.id===anchorId):undefined
 const seat=useMemo(()=>table&&npc.seatNumber ? tableSeats(table)[npc.seatNumber-1] : undefined,[table,npc.seatNumber])
 const seated=!!(npc.seated&&table&&seat)
 useEffect(()=>{
  if(seated&&table&&seat){
   const height=table.seatSurfaceY??.56
   motion.current.push({...npc,x:table.position[0]+seat.x,y:table.position[1]+height-.56,z:table.position[2]+seat.z,yaw:seat.yaw},received)
  }else motion.current.push({...npc,yaw:npc.yaw??0},received)
 },[npc,received,seated,table,seat])
 useFrame((_,dt)=>{if(!ref.current)return;ref.current.visible=performance.now()-useCompanions.getState().actorReceivedAt<5000
  if(!ref.current.visible)return
  const p=motion.current.sample(performance.now());if(!p)return
  const last=previous.current,d=last?Math.hypot(p.x-last[0],p.y-last[1],p.z-last[2]):0
  speed.current+=((d<2?Math.min(10,d/Math.max(.001,dt)):0)-speed.current)*(1-Math.exp(-12*dt));previous.current=[p.x,p.y,p.z]
  ref.current.position.set(p.x,p.y,p.z);const delta=Math.atan2(Math.sin(p.yaw-ref.current.rotation.y),Math.cos(p.yaw-ref.current.rotation.y));ref.current.rotation.y+=delta*(1-Math.exp(-9*dt))})
 return <group ref={ref} position={initial.current} rotation={initialRotation.current} name={npc.name}>
  <ResidentModel kind={kind} speed={speed} seated={seated}/>
  <NpcSpeechBubble actor={npc.id} name={npc.name} kind={kind} ambient={npc.ambient} height={(child?1.9:2.35)-(seated?.26:0)}/>
 </group>
}
