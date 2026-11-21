import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group } from 'three'
import { ResidentModel } from './ParkNpcModel'
import { NpcSpeechBubble } from './NpcSpeechBubble'
import { NpcMotion } from './npcMotion'
import { useOntop, type OntopActor as Actor } from './ontop'
import { FrostEffect } from '../winter/FrostEffect'

export function OntopActor() {
  const actor = useOntop(s => s.actor)
  return actor ? <Resident key={actor.id} actor={actor} /> : null
}

function Resident({ actor }: { actor: Actor }) {
  const root = useRef<Group>(null), speed = useRef(0), motion = useRef(new NpcMotion())
  const initial = useRef<[number, number, number]>([actor.x, actor.y, actor.z])
  const previous = useRef<{ x: number; z: number } | null>(null)
  const received = useOntop(s => s.receivedAt)
  useEffect(() => { motion.current.push(actor, received) }, [actor, received])
  useFrame((_, delta) => {
    if (!root.current) return
    root.current.visible = performance.now() - useOntop.getState().receivedAt < 5000
    const sample = motion.current.sample(performance.now())
    if (!root.current.visible || !sample) return
    const before = previous.current
    const measured = before ? Math.min(5, Math.hypot(sample.x - before.x, sample.z - before.z) / Math.max(.001, delta)) : 0
    speed.current += (measured - speed.current) * (1 - Math.exp(-12 * delta))
    previous.current = sample
    root.current.position.set(sample.x, sample.y, sample.z)
    const angle = Math.atan2(Math.sin(sample.yaw - root.current.rotation.y), Math.cos(sample.yaw - root.current.rotation.y))
    root.current.rotation.y += angle * (1 - Math.exp(-12 * delta))
    root.current.userData.action = actor.action
    root.current.userData.opponentId = actor.opponentId
  })
  return <group ref={root} name="온탑" position={initial.current} userData={{ npc: true, id: actor.id }}>
    <ResidentModel kind="NEIGHBOR" speed={speed} snowballId={actor.id} />
    <group position={[0, .8, 0]}><FrostEffect userId={actor.id} /></group>
    <NpcSpeechBubble actor={actor.id} name="온탑" kind="NEIGHBOR"
      ambient={actor.speech ? { text: actor.speech, expiresAt: actor.speechUntil } : null} />
  </group>
}
