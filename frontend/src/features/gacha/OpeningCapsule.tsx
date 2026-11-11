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
  const y=revealed?-.95:-.1,scale=revealed?.9:1,lidX=opened?-1.05:0,lidY=opened?1.6:0,lidTilt=opened?-1.05:0,lidRoll=opened?.48:0
  root.current.rotation.z=MathUtils.lerp(root.current.rotation.z,rock,blend)
  root.current.position.y=MathUtils.lerp(root.current.position.y,y,blend)
  root.current.scale.setScalar(MathUtils.lerp(root.current.scale.x,scale,blend))
  hinge.current.rotation.x=MathUtils.lerp(hinge.current.rotation.x,lidTilt,blend)
  hinge.current.rotation.z=MathUtils.lerp(hinge.current.rotation.z,lidRoll,blend)
  hinge.current.position.x=MathUtils.lerp(hinge.current.position.x,lidX,blend)
  hinge.current.position.y=MathUtils.lerp(hinge.current.position.y,lidY,blend)
  const moving=[[root.current.rotation.z,rock],[root.current.position.y,y],[root.current.scale.x,scale],[hinge.current.rotation.x,lidTilt],[hinge.current.rotation.z,lidRoll],[hinge.current.position.x,lidX],[hinge.current.position.y,lidY]].some(([value,target])=>Math.abs(value-target)>.001)
  if(!reduced&&(moving||phase==='sway'&&t<.95))invalidate()
 })
 const gold=<meshStandardMaterial color="#e8bc57" metalness={.65} roughness={.26}/>
 return <group ref={root} rotation={[.12,-.2,0]}>
  <mesh><sphereGeometry args={[1,48,24,0,Math.PI*2,Math.PI/2,Math.PI/2]}/><meshPhysicalMaterial color={color} side={DoubleSide} clearcoat={.6} roughness={.34}/></mesh>
  <mesh><sphereGeometry args={[.965,48,24,0,Math.PI*2,Math.PI/2,Math.PI/2]}/><meshStandardMaterial color="#efd088" side={DoubleSide} metalness={.45} roughness={.3}/></mesh>
  <mesh rotation={[Math.PI/2,0,0]}><torusGeometry args={[.99,.035,12,64]}/>{gold}</mesh>
  <mesh position={[0,-.86,0]} scale={[.52,.08,.52]}><sphereGeometry args={[1,32,16]}/>{gold}</mesh>
  <group ref={hinge}>
   <group>
    <mesh><sphereGeometry args={[1,48,24,0,Math.PI*2,0,Math.PI/2]}/><meshPhysicalMaterial color={color} side={DoubleSide} clearcoat={.6} roughness={.34}/></mesh>
    <mesh><sphereGeometry args={[.965,48,24,0,Math.PI*2,0,Math.PI/2]}/><meshStandardMaterial color="#efd088" side={DoubleSide} metalness={.45} roughness={.3}/></mesh>
    <mesh rotation={[Math.PI/2,0,0]}><torusGeometry args={[.99,.035,12,64]}/>{gold}</mesh>
    <mesh position={[0,1.06,0]} scale={[.2,.13,.2]}><sphereGeometry args={[1,24,16]}/>{gold}</mesh>
    {grade===1&&<mesh position={[0,1.25,0]}><coneGeometry args={[.12,.28,6]}/>{gold}</mesh>}
   </group>
  </group>
  {/* Raised gold bands and flower clasps follow the shell surface. */}
  {[-.5,-.72].map(y=><mesh key={y} position={[0,y,0]} rotation={[Math.PI/2,0,0]}><torusGeometry args={[Math.sqrt(1-y*y),.018,8,64]}/>{gold}</mesh>)}
  {[-1,0,1].map(side=><group key={side} position={[side*.63,-.36,side===0?.94:.69]} rotation={[0,side*.65,0]}>
   {[0,1,2,3,4].map(i=><mesh key={i} position={[Math.sin(i*Math.PI*2/5)*.105,Math.cos(i*Math.PI*2/5)*.105,0]} rotation={[0,0,-i*Math.PI*2/5]} scale={[.065,.1,.035]}><sphereGeometry args={[1,16,12]}/>{gold}</mesh>)}
   <mesh position={[0,0,.04]}><sphereGeometry args={[.062,16,12]}/><meshStandardMaterial color="#ffe5a2" metalness={.65} roughness={.18}/></mesh>
  </group>)}
  <mesh position={[0,-.16,.99]} rotation={[Math.PI/2,0,0]}><torusGeometry args={[.12,.025,10,32]}/>{gold}</mesh>
  {opened&&<pointLight position={[0,.2,0]} color="#ffe9b5" intensity={1.4} distance={2.5}/>}
 </group>
}
