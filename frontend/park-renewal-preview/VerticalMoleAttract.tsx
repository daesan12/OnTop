import {useMemo,useRef} from 'react'
import {useFrame} from '@react-three/fiber'
import {type Group,type Mesh,type MeshBasicMaterial} from 'three'
import {type RecreationFacility,recreationMachines} from './original/map/park/recreation.ts'
import {buildMoleDemoHead,buildMoleDemoHammer} from './approved/mole-shop-20261107-v1/core/frontend/src/world/art/moleShopGeometry'
import {PropModel} from '../src/world/art/PropModel'
import {MOLE_DEMO_DIMENSIONS as D} from './original/world/art/moleDemoDimensions.ts'
import {sampleVerticalMole,VERTICAL_MOLE} from './verticalMoleMotion'
const headArt=buildMoleDemoHead(),hammerArt=buildMoleDemoHammer()
export function VerticalMoleAttract({facility}:{facility:RecreationFacility}){
 const targets=useMemo(()=>recreationMachines(facility).flatMap(m=>[-.4,.4].map(dz=>({x:m.x,z:m.z+dz}))),[facility])
 const heads=useRef<Array<Group|null>>([]),hammer=useRef<Group>(null),ring=useRef<Mesh>(null),elapsed=useRef(0)
 useFrame((_,delta)=>{
  elapsed.current+=Math.min(delta,.1);const p=sampleVerticalMole(elapsed.current),a=targets[p.target]!,b=targets[p.next]!
  heads.current.forEach((head,i)=>{if(head){head.visible=i===p.target&&p.pop>.025;head.position.y=i===p.target?p.moleY:D.hiddenY}})
  // Rotate the cylinder's striking face onto Y, then translate straight down.
  // The handle stays horizontal; it no longer sweeps the head sideways into a mole.
  hammer.current?.position.set(a.x+(b.x-a.x)*p.travel+D.hammerLength,p.headY,a.z+(b.z-a.z)*p.travel)
  if(ring.current){ring.current.visible=p.impact>0;ring.current.position.set(a.x,1.46,a.z);ring.current.scale.setScalar(1+(1-p.impact)*1.1);(ring.current.material as MeshBasicMaterial).opacity=p.impact*.8}
 })
 return <group name="mole-shop-vertical-attract-mode" userData={{previewOnly:true}}>
  {targets.map((p,i)=><group key={i} ref={node=>{heads.current[i]=node}} position={[p.x,D.hiddenY,p.z]} visible={false}><PropModel art={headArt} name={'mole-demo-head-'+i}/></group>)}
  <group ref={hammer} name="mole-demo-vertical-hammer" rotation={[0,0,VERTICAL_MOLE.rotationZ]}><PropModel art={hammerArt} name="mole-demo-hammer-art"/></group>
  <mesh name="mole-demo-impact-ring" ref={ring} rotation={[-Math.PI/2,0,0]} visible={false}><torusGeometry args={[.39,.025,8,32]}/><meshBasicMaterial color="#f3c66b" transparent opacity={0} depthWrite={false}/></mesh>
 </group>
}
