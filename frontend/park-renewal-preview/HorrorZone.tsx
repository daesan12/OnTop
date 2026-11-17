import {useEffect,useLayoutEffect,useRef,type RefObject} from 'react'
import {useFrame} from '@react-three/fiber'
import {Color,Matrix4,type Group,type InstancedMesh,type Object3D,type PointLight} from 'three'
import {effectsOutput} from '../src/audio/bgm'
import {UndergroundAmbience} from './horrorAudio'
import {horrorGround} from './horrorPlan'
import {horrorShell,horrorArt,horrorRamp,HORROR_LAMPS,HORROR_PENDANTS} from './horrorGeometry'
import {HorrorStoneMaterial} from './HorrorStoneMaterial'
import {GrimeMaterial,HazedGlowMaterial} from './HorrorGrimeMaterial'
import {HorrorDressing} from './HorrorDressing'
import {HallDetails} from './InteriorDetails'
import {InteriorEncounters} from './InteriorEncounters'
import {lampFlicker,DYING_LAMPS} from './horrorDressingPlan'

const lampLights=HORROR_LAMPS.map((p,i)=>({p,i})).filter(({i})=>i%2===0)
const warm=new Color('#ffb46a'),sick=new Color('#9fd1b0'),bulb=new Color()

/** Lamps breathe a little; two of them are failing and stutter out (horrorDressingPlan.lampFlicker). Runs before the
 * encounter dimming (priority .65), which then scales whatever this frame set. */
function Flicker({lights,bulbs}:{lights:RefObject<(PointLight|null)[]>;bulbs:RefObject<InstancedMesh|null>}){
 useFrame(({clock})=>{
  const t=clock.elapsedTime
  lights.current?.forEach((light,k)=>{if(light)light.intensity=light.userData.base*lampFlicker(lampLights[k]!.i,t)})
  const mesh=bulbs.current;if(!mesh)return
  HORROR_LAMPS.forEach((_,i)=>{const f=lampFlicker(i,t);mesh.setColorAt(i,bulb.copy(i===8?sick:warm).multiplyScalar(.12+f*1.05))})
  if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true
 },.6)
 return null
}

/** The hall hums, drips and groans while it is on screen (horrorAudio); silent and released when you leave. */
function Ambience({zone}:{zone:RefObject<Group|null>}){
 const ambience=useRef(new UndergroundAmbience())
 useEffect(()=>()=>{const out=effectsOutput();if(out)ambience.current.stop(out.context)},[])
 useFrame(()=>{
  const out=effectsOutput();if(!out)return
  let shown=!!zone.current;for(let n:Object3D|null=zone.current;n;n=n.parent)if(!n.visible)shown=false
  ambience.current.tick(out.context,out.bus,shown)
 })
 return null
}

export function HorrorZone(){
 const zone=useRef<Group>(null)
 const lights=useRef<(PointLight|null)[]>([])
 const bulbs=useRef<InstancedMesh>(null)
 useLayoutEffect(()=>{
  const mesh=bulbs.current;if(!mesh)return
  HORROR_LAMPS.forEach(([x,z],i)=>{mesh.setMatrixAt(i,new Matrix4().makeScale(.24,.44,.24).setPosition(x,horrorGround(x,z)+3,z));mesh.setColorAt(i,warm)})
  mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere()
 },[])
 return <group ref={zone} name="underground-horror-zone">
   <HallDetails/>
   <InteriorEncounters/>
   <ambientLight color="#8e9c94" intensity={.17}/>
   <hemisphereLight color="#4a5c58" groundColor="#211a13" intensity={.42}/>
   {Object.entries(horrorShell).map(([k,g])=><mesh key={k} name={'opaque-underground-shell-'+k} geometry={g} userData={{keepOpaque:true}}><HorrorStoneMaterial/></mesh>)}
   <mesh geometry={horrorRamp} name="exit-return-ramp" userData={{keepOpaque:true}}><HorrorStoneMaterial color="#535a4c"/></mesh>
   {Object.entries(horrorArt).map(([k,g])=><mesh key={k} geometry={g} name={'horror-'+k} userData={{keepOpaque:true}}>{k==='glow'?<HazedGlowMaterial/>:k==='stone'?<HorrorStoneMaterial/>:<GrimeMaterial kind={k==='metal'||k==='gold'?'metal':k==='wood'?'wood':'paint'} vertexColors flatShading/>}</mesh>)}
   <instancedMesh ref={bulbs} args={[undefined,undefined,HORROR_LAMPS.length]} name="horror-lamp-bulbs" userData={{keepOpaque:true}} frustumCulled={false}>
    <boxGeometry/><HazedGlowMaterial vertexColors={false}/>
   </instancedMesh>
   {lampLights.map(({p:[x,z],i},k)=><pointLight key={k} ref={l=>{lights.current[k]=l}} userData={{base:DYING_LAMPS.includes(i)?40:34}} position={[x,horrorGround(x,z)+3,z]} color={i===8?'#8bb49a':'#d79b51'} intensity={34} distance={17} decay={1.4}/>)}
   {HORROR_PENDANTS.map(([x,z],i)=><pointLight key={'pendant-'+i} position={[x,12.1,z]} color={i===1?'#a7b49a':'#d5ae6c'} intensity={65} distance={27} decay={1.4}/>)}
   <HorrorDressing/>
   <Flicker lights={lights} bulbs={bulbs}/>
   <Ambience zone={zone}/>
 </group>
}
