import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group } from 'three'
import { ResidentModel } from './ParkNpcModel'
import { useWorldAi, type PatrolNpc } from './worldAi'
import { NpcMotion } from './npcMotion'
import { NpcSpeechBubble } from './NpcSpeechBubble'

/** Same server-authored actor persists through patrol, response and arrival speech. */
export function PoliceNpcs() {
  const npcs=useWorldAi(s => s.npcs)
  return <group name="world-ai-police">{npcs.map(n => <PoliceActor key={n.id} npc={n}/>)}</group>
}
function PoliceActor({npc}:{npc:PatrolNpc}) {
  const actor=useRef<Group>(null),motion=useRef(new NpcMotion()),speed=useRef(0)
  const initialPosition=useRef<[number,number,number]>([npc.x,npc.y,npc.z])
  const received=useWorldAi(s=>s.npcReceivedAt)
  const previous=useRef<[number,number,number]|null>(null)
  useEffect(()=>{motion.current.push(npc,received)},[npc,received])
  useFrame((_,dt) => {
    if(!actor.current) return
    actor.current.visible=performance.now()-useWorldAi.getState().npcReceivedAt<5000
    const p=motion.current.sample(performance.now());if(!p)return
    const last=previous.current,distance=last?Math.hypot(p.x-last[0],p.y-last[1],p.z-last[2]):0
    const measured=distance<2?Math.min(10,distance/Math.max(.001,dt)):0
    speed.current+=(measured-speed.current)*(1-Math.exp(-12*dt));previous.current=[p.x,p.y,p.z]
    actor.current.position.set(p.x,p.y,p.z)
    const delta=Math.atan2(Math.sin(p.yaw-actor.current.rotation.y),Math.cos(p.yaw-actor.current.rotation.y))
    actor.current.rotation.y+=delta*(1-Math.exp(-9*dt))
  })
  return <group ref={actor} name="patrolling-police" position={initialPosition.current} userData={{npc:true,action:npc.action}}>
    <ResidentModel kind="POLICE" speed={speed} airborne={npc.action==='RETURN_JUMP'} talking={npc.action==='TALK'||npc.action==='TELEPORT_WARNING'}/>
    <NpcSpeechBubble actor="police" name={npc.name} ambient={npc.ambient} active={npc.action==='TALK'||npc.action==='TELEPORT_WARNING'}/>
  </group>
}
