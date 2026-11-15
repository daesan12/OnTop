import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { createFenceJump, stepFenceJump, type FenceJumpSite } from './fenceJump'

export function FenceJumpPreview({site,onFinish}:{site:FenceJumpSite;onFinish:(landedOnFence:boolean)=>void}){
 const marker=useRef<Group>(null)
 const [jump]=useState(()=>createFenceJump(site))
 useFrame((_,delta)=>{
  if(!marker.current||jump.finished)return
  stepFenceJump(jump,delta)
  marker.current.position.set(jump.position[0],jump.y,jump.position[1])
  if(jump.finished)onFinish(jump.landedOnFence)
 })
 return <group ref={marker} position={[jump.position[0],jump.y,jump.position[1]]}>
  <mesh position={[0,.61,0]}>
   <capsuleGeometry args={[.24,.74,5,10]}/>
   <meshLambertMaterial color="#23726e"/>
  </mesh>
  <mesh position={[0,1.38,0]}>
   <sphereGeometry args={[.23,10,8]}/>
   <meshLambertMaterial color="#f0c786"/>
  </mesh>
 </group>
}
