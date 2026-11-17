import {useEffect,useLayoutEffect,useRef,type RefObject} from 'react'
import {useFrame} from '@react-three/fiber'
import {Color,Matrix4,Object3D,Vector3,type Group,type InstancedMesh,type PointLight,type SpotLight} from 'three'
import {effectsOutput} from '../src/audio/bgm'
import {UndergroundAmbience} from './horrorAudio'
import {horrorGround} from './horrorPlan'
import {horrorShell,horrorArt,horrorRamp,HORROR_LAMPS,HORROR_PENDANTS} from './horrorGeometry'
import {HorrorStoneMaterial} from './HorrorStoneMaterial'
import {GrimeMaterial,HazedGlowMaterial} from './HorrorGrimeMaterial'
import {HorrorDressing} from './HorrorDressing'
import {HallDetails} from './InteriorDetails'
import {InteriorEncounters} from './InteriorEncounters'
import {lampFlicker,lampOverride,DYING_LAMPS} from './horrorDressingPlan'
import {flashlight} from './encounterStaging'
import {HorrorPresence} from './HorrorPresence'

const lampLights=HORROR_LAMPS.map((p,i)=>({p,i})).filter(({i})=>i%2===0)
const warm=new Color('#ffb46a'),sick=new Color('#9fd1b0'),bulb=new Color()

/** Lamps breathe a little; two of them are failing and stutter out (horrorDressingPlan.lampFlicker). Runs before the
 * encounter dimming (priority .65), which then scales whatever this frame set. */
function Flicker({lights,bulbs}:{lights:RefObject<(PointLight|null)[]>;bulbs:RefObject<InstancedMesh|null>}){
 useFrame(({clock})=>{
  const t=clock.elapsedTime
  lights.current?.forEach((light,k)=>{if(light){const i=lampLights[k]!.i;light.intensity=light.userData.base*lampFlicker(i,t)*lampOverride[i]!}})
  const mesh=bulbs.current;if(!mesh)return
  HORROR_LAMPS.forEach((_,i)=>{const f=lampFlicker(i,t)*lampOverride[i]!;mesh.setColorAt(i,bulb.copy(i===8?sick:warm).multiplyScalar(.12+f*1.05))})
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

/** Your own light: a hand torch at the eyes that follows the view (first person underground). The hall is dark
 * outside it; scares dim and cut it with the lamps (encounterStaging.flashlight). */
function Flashlight(){
 const light=useRef<SpotLight>(null),target=useRef(new Object3D()),forward=useRef(new Vector3()),side=useRef(new Vector3())
 useFrame(({camera,clock})=>{
  const l=light.current;if(!l)return
  camera.getWorldDirection(forward.current)
  side.current.set(-forward.current.z,0,forward.current.x).normalize()
  const t=clock.elapsedTime,bob=Math.sin(t*1.7)*.012
  l.position.copy(camera.position).addScaledVector(side.current,.22).add(new Vector3(0,-.22+bob,0))
  target.current.position.copy(camera.position).addScaledVector(forward.current,8)
  target.current.updateMatrixWorld()
  // A tired battery: it breathes a little and now and then catches.
  const sag=Math.sin(t*.31)*Math.sin(t*1.13)>.93?.45:1
  l.intensity=70*flashlight.factor*sag*(.96+.04*Math.sin(t*23))
 },.7)
 return <>
  <spotLight ref={light} target={target.current} color="#ffe6c4" intensity={70} distance={24} decay={1.5} angle={.46} penumbra={.6}/>
  <primitive object={target.current}/>
 </>
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
   <ambientLight color="#8e9c94" intensity={.06}/>
   <hemisphereLight color="#4a5c58" groundColor="#211a13" intensity={.14}/>
   <Flashlight/>
   {Object.entries(horrorShell).map(([k,g])=><mesh key={k} name={'opaque-underground-shell-'+k} geometry={g} userData={{keepOpaque:true}}><HorrorStoneMaterial/></mesh>)}
   <mesh geometry={horrorRamp} name="exit-return-ramp" userData={{keepOpaque:true}}><HorrorStoneMaterial color="#535a4c"/></mesh>
   {Object.entries(horrorArt).map(([k,g])=><mesh key={k} geometry={g} name={'horror-'+k} userData={{keepOpaque:true}}>{k==='glow'?<HazedGlowMaterial/>:k==='stone'?<HorrorStoneMaterial/>:<GrimeMaterial kind={k==='metal'||k==='gold'?'metal':k==='wood'?'wood':'paint'} vertexColors flatShading/>}</mesh>)}
   <instancedMesh ref={bulbs} args={[undefined,undefined,HORROR_LAMPS.length]} name="horror-lamp-bulbs" userData={{keepOpaque:true}} frustumCulled={false}>
    <boxGeometry/><HazedGlowMaterial vertexColors={false}/>
   </instancedMesh>
   {lampLights.map(({p:[x,z],i},k)=><pointLight key={k} ref={l=>{lights.current[k]=l}} userData={{base:DYING_LAMPS.includes(i)?30:26}} position={[x,horrorGround(x,z)+3,z]} color={i===8?'#8bb49a':'#d79b51'} intensity={34} distance={12} decay={1.4}/>)}
   {HORROR_PENDANTS.map(([x,z],i)=><pointLight key={'pendant-'+i} position={[x,12.1,z]} color={i===1?'#a7b49a':'#d5ae6c'} intensity={38} distance={18} decay={1.4}/>)}
   <HorrorDressing/>
   <Flicker lights={lights} bulbs={bulbs}/>
   <Ambience zone={zone}/>
   <HorrorPresence zone={zone}/>
 </group>
}
