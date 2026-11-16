import type {PropFinish} from '../../../../../src/world/art/propGeometry.ts'
import {useFrame} from '@react-three/fiber'
import {gachaMaterials} from './gachaMaterials.ts'
import {ParkCapsules} from './ParkCapsules.tsx'
import {buildGachaMachine,PARK_CAPSULES} from './gachaMachineGeometry.ts'
import {gachaGlassGeometry,glassVertex,glassFragment} from './gachaGlass.ts'
import {cueAge,useGachaMixCue} from './gachaMixCue.ts'
import {createLeverDriver,leverPullAngle} from './gachaLever.ts'
const art=buildGachaMachine()
const moveLever=createLeverDriver(art.gold!)
/** Procedural source asset. The caller chooses local preview vs authenticated interaction. */
export function GachaMachine({onInteract}:{onInteract?:()=>void}){
 useFrame(()=>moveLever(leverPullAngle(cueAge(useGachaMixCue.getState().cue))))
 return <group name="hanok-gacha-machine" onClick={e=>{if(onInteract&&e.delta<5){e.stopPropagation();onInteract()}}} userData={{asset:'hanok-gacha',capsuleCount:PARK_CAPSULES.length}}>
  <group name="gacha-timber-gold-and-roof">{Object.entries(art).map(([kind,geometry])=><mesh key={kind} geometry={geometry} material={gachaMaterials[kind as PropFinish]} dispose={null} castShadow receiveShadow/>)}</group>
  <mesh name="gacha-opaque-outlet-liner" position={[0,1.05,.75]} raycast={()=>{}}>
    <boxGeometry args={[1.99,1.72,.16]}/><meshStandardMaterial color="#39281d" roughness={.88}/>
  </mesh>
  <ParkCapsules/>
  <mesh geometry={gachaGlassGeometry} name="gacha-glass-jar" dispose={null} renderOrder={2}><shaderMaterial vertexShader={glassVertex} fragmentShader={glassFragment} transparent depthWrite={false}/></mesh>
 </group>
}
