import type {PropFinish} from '../../../world/art/propGeometry'
import {useFrame} from '@react-three/fiber'
import {gachaMaterials} from './gachaMaterials'
import {ParkCapsules} from './ParkCapsules'
import {buildGachaMachine,PARK_CAPSULES} from './gachaMachineGeometry'
import {gachaGlassGeometry,glassVertex,glassFragment} from './gachaGlass'
import {cueAge,useGachaMixCue} from './gachaMixCue'
import {createLeverDriver,leverPullAngle} from './gachaLever'
const art=buildGachaMachine()
const moveLever=createLeverDriver(art.gold!)
/** Procedural source asset. The caller chooses local preview vs authenticated interaction. */
export function GachaMachine({onInteract}:{onInteract?:()=>void}){
 useFrame(()=>moveLever(leverPullAngle(cueAge(useGachaMixCue.getState().cue))))
 return <group name="hanok-gacha-machine" onClick={e=>{if(onInteract&&e.delta<5){e.stopPropagation();onInteract()}}} userData={{asset:'hanok-gacha',capsuleCount:PARK_CAPSULES.length}}>
  <group name="gacha-timber-gold-and-roof">{Object.entries(art).map(([kind,geometry])=><mesh key={kind} geometry={geometry} material={gachaMaterials[kind as PropFinish]} dispose={null} castShadow receiveShadow/>)}</group>
  <ParkCapsules/>
  <mesh geometry={gachaGlassGeometry} name="gacha-glass-jar" dispose={null} renderOrder={2}><shaderMaterial vertexShader={glassVertex} fragmentShader={glassFragment} transparent depthWrite={false}/></mesh>
 </group>
}
