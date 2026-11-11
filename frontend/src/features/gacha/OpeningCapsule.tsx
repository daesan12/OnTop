import {useEffect, useRef} from 'react'
import {useFrame, useThree} from '@react-three/fiber'
import {DoubleSide, Group, MathUtils} from 'three'

/** The same hollow shell stays mounted from anticipation to the final receipt. */
export function OpeningCapsule({grade,phase,startedAt,reduced,revealed}:{grade:number;phase:string;startedAt:number;reduced:boolean;revealed:boolean}){
 const root=useRef<Group>(null),hinge=useRef<Group>(null)
 const color=['','#ba4243','#86609d','#4f87a6','#739166'][grade]??'#739166'
 const opened=phase==='opening'||revealed
 const invalidate=useThree(s=>s.invalidate)
 useEffect(()=>invalidate(),[phase,revealed,reduced,invalidate])
 useFrame((_,delta)=>{
  if(!root.current||!hinge.current)return
  const blend=reduced?1:1-Math.exp(-Math.min(delta,.05)*9)
  const t=Math.max(0,(performance.now()-startedAt)/1000)
  const rock=!reduced&&phase==='sway'&&t<.95?Math.sin(t*Math.PI*4)*Math.sin(t/.95*Math.PI)*.075:0
  root.current.rotation.z=MathUtils.lerp(root.current.rotation.z,rock,blend)
  root.current.position.y=MathUtils.lerp(root.current.position.y,revealed?-1.12:-.1,blend)
  root.current.scale.setScalar(MathUtils.lerp(root.current.scale.x,revealed?.7:1,blend))
  hinge.current.rotation.x=MathUtils.lerp(hinge.current.rotation.x,opened?-1.65:0,blend)
  const moving=Math.abs(root.current.rotation.z-rock)>.001||Math.abs(root.current.position.y-(revealed?-1.12:-.1))>.001||Math.abs(root.current.scale.x-(revealed?.7:1))>.001||Math.abs(hinge.current.rotation.x-(opened?-1.65:0))>.001
  if(!reduced&&(moving||phase==='sway'&&t<.95))invalidate()
 })
 const gold=<meshStandardMaterial color="#d9b66d" metalness={.65} roughness={.34}/>
 return <group ref={root} rotation={[.12,-.2,0]}>
  <mesh><sphereGeometry args={[1,48,24,0,Math.PI*2,Math.PI/2,Math.PI/2]}/><meshPhysicalMaterial color={color} side={DoubleSide} clearcoat={.6} roughness={.34}/></mesh>
  <mesh rotation={[Math.PI/2,0,0]}><torusGeometry args={[.99,.035,12,64]}/>{gold}</mesh>
  <mesh position={[0,-.86,0]} scale={[.52,.08,.52]}><sphereGeometry args={[1,32,16]}/>{gold}</mesh>
  <group ref={hinge} position={[0,0,-.98]}>
   <group position={[0,0,.98]}>
    <mesh><sphereGeometry args={[1,48,24,0,Math.PI*2,0,Math.PI/2]}/><meshPhysicalMaterial color={color} side={DoubleSide} clearcoat={.6} roughness={.34}/></mesh>
    <mesh rotation={[Math.PI/2,0,0]}><torusGeometry args={[.99,.035,12,64]}/>{gold}</mesh>
    <mesh position={[0,1.06,0]} scale={[.2,.13,.2]}><sphereGeometry args={[1,24,16]}/>{gold}</mesh>
    {grade===1&&<mesh position={[0,1.25,0]}><coneGeometry args={[.12,.28,6]}/>{gold}</mesh>}
   </group>
  </group>
  <mesh position={[0,-.16,.99]} rotation={[Math.PI/2,0,0]}><torusGeometry args={[.12,.025,10,32]}/>{gold}</mesh>
  {opened&&<pointLight position={[0,.2,0]} color="#ffe9b5" intensity={1.4} distance={2.5}/>}
 </group>
}
