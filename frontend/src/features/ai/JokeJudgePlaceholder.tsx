import {useRef} from 'react'
import {useFrame} from '@react-three/fiber'
import type {Group} from 'three'

/** Temporary primitives only. Replace this component with the teammate's final character asset. */
export function JokeJudgePlaceholder({talking=false}:{talking?:boolean}) {
 const body=useRef<Group>(null),head=useRef<Group>(null)
 useFrame(({clock})=>{
  if(body.current)body.current.position.y=Math.sin(clock.elapsedTime*1.8)*.008
  if(head.current)head.current.rotation.z=talking?Math.sin(clock.elapsedTime*2.4)*.035:0
 })
 return <group ref={body} name="joke-judge-placeholder">
  {[-1,1].map(side=><group key={side}>
   <mesh position={[side*.17,.45,0]} castShadow><boxGeometry args={[.25,.65,.29]}/><meshStandardMaterial color="#3e3d40"/></mesh>
   <mesh position={[side*.17,.095,.06]} castShadow><boxGeometry args={[.29,.18,.43]}/><meshStandardMaterial color="#654432"/></mesh>
   <mesh position={[side*.43,1.05,0]} rotation={[0,0,side*.1]} castShadow><capsuleGeometry args={[.11,.4,3,8]}/><meshStandardMaterial color="#30364d"/></mesh>
   <mesh position={[side*.46,.72,.02]} castShadow><sphereGeometry args={[.105,10,8]}/><meshStandardMaterial color="#efbb91"/></mesh>
  </group>)}
  <mesh position={[0,1.08,0]} castShadow><cylinderGeometry args={[.32,.39,.76,12]}/><meshStandardMaterial color="#30364d"/></mesh>
  <mesh position={[0,1.14,.365]}><boxGeometry args={[.38,.58,.04]}/><meshStandardMaterial color="#b6cbdf"/></mesh>
  {[-1,1].map(side=><mesh key={side} position={[side*.18,1.2,.395]} rotation={[0,0,side*.24]}><boxGeometry args={[.12,.45,.025]}/><meshStandardMaterial color="#252d42"/></mesh>)}
  <mesh position={[0,1.12,.405]} rotation={[0,0,-.09]}><boxGeometry args={[.09,.34,.025]}/><meshStandardMaterial color="#e4ad34"/></mesh>
  <mesh position={[0,1.3,.425]}><octahedronGeometry args={[.065]}/><meshStandardMaterial color="#edb943"/></mesh>
  <group position={[-.245,1.29,.31]} rotation={[0,-.35,0]}>
   <mesh><circleGeometry args={[.06,16]}/><meshStandardMaterial color="#ffd34b"/></mesh>
   {[-1,1].map(side=><mesh key={side} position={[side*.02,.012,.006]}><sphereGeometry args={[.006,6,4]}/><meshBasicMaterial color="#45352e"/></mesh>)}
   <mesh position={[0,-.006,.006]} rotation={[0,0,Math.PI]}><torusGeometry args={[.025,.004,4,12,Math.PI]}/><meshBasicMaterial color="#45352e"/></mesh>
  </group>
  <group ref={head} position={[0,1.73,.02]}>
   <mesh castShadow><sphereGeometry args={[.34,16,12]}/><meshStandardMaterial color="#efbb91"/></mesh>
   <mesh castShadow><sphereGeometry args={[.35,14,8,0,Math.PI*2,0,Math.PI*.48]}/><meshStandardMaterial color="#40312d"/></mesh>
   <mesh position={[-.12,.25,.13]} scale={[1.3,.55,.85]} rotation={[0,0,.3]} castShadow><sphereGeometry args={[.2,12,8]}/><meshStandardMaterial color="#40312d"/></mesh>
   {[-1,1].map(side=><group key={side}>
    <mesh position={[side*.335,-.015,0]}><sphereGeometry args={[.075,10,8]}/><meshStandardMaterial color="#efbb91"/></mesh>
    <mesh position={[side*.315,.075,.015]}><boxGeometry args={[.035,.14,.16]}/><meshStandardMaterial color="#aaa29a"/></mesh>
    <mesh position={[side*.13,.035,.318]} scale={[1.15,.85,1]}><torusGeometry args={[.102,.014,5,16]}/><meshStandardMaterial color="#40352f"/></mesh>
    <mesh position={[side*.13,.02,.329]}><torusGeometry args={[.05,.009,4,12,Math.PI]}/><meshBasicMaterial color="#3b2e29"/></mesh>
    <mesh position={[side*.13,.16,.285]} rotation={[0,0,side*-.12]}><boxGeometry args={[.13,.025,.035]}/><meshStandardMaterial color="#40312d"/></mesh>
   </group>)}
   <mesh position={[0,.035,.34]}><boxGeometry args={[.075,.015,.02]}/><meshStandardMaterial color="#40352f"/></mesh>
   <mesh position={[0,-.025,.34]}><sphereGeometry args={[.06,10,8]}/><meshStandardMaterial color="#e5a781"/></mesh>
   <mesh position={[0,-.14,.3]} scale={[1,.62,.25]}><sphereGeometry args={[.125,12,8]}/><meshBasicMaterial color="#6a302b"/></mesh>
   <mesh position={[0,-.103,.328]}><boxGeometry args={[.15,.027,.018]}/><meshBasicMaterial color="#fff3db"/></mesh>
  </group>
 </group>
}
