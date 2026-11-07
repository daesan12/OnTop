import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ExtrudeGeometry, Group, Path, Shape, Vector3 } from 'three'
import type { Phase } from './capsuleMotion'
import { CapsulePile, VISUAL_CAPSULE_COUNT } from './capsulePile'
import { capsuleName } from './labels'

const COLORS:Record<number,string>={1:'#d83239',2:'#9858cf',3:'#378ed2',4:'#70a75a',5:'#e6b64b'}
function mixedVisualGrades(){
 const grades=Array.from({length:VISUAL_CAPSULE_COUNT},(_,i)=>i%15===14?5:i%4+1)
 // Cosmetic placement only. Server receipts still select the actual output grade.
 for(let i=grades.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[grades[i],grades[j]]=[grades[j]!,grades[i]!]}
 return grades
}
const at=(x:number,y:number,z=15)=>new Vector3(x-500,281.25-y,z)
const outletStart=at(500,401),outletEnd=at(500,441)
const coinShape=new Shape();coinShape.absarc(0,0,.92,0,Math.PI*2,false)
const hole=new Path();hole.moveTo(-.24,-.24);hole.lineTo(-.24,.24);hole.lineTo(.24,.24);hole.lineTo(.24,-.24);hole.closePath();coinShape.holes.push(hole)
const coinGeometry=new ExtrudeGeometry(coinShape,{depth:.15,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.035,bevelThickness:.03,curveSegments:32})
const flowerShape=new Shape()
for(let i=0;i<=30;i++){
 const a=i/30*Math.PI*2,r=.17+.04*Math.cos(a*5),x=Math.sin(a)*r,y=Math.cos(a)*r
 if(i===0)flowerShape.moveTo(x,y);else flowerShape.lineTo(x,y)
}
const flowerGeometry=new ExtrudeGeometry(flowerShape,{depth:.035,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:.015,bevelThickness:.015})
const gold='#efc56d'
function Gold(){return <meshStandardMaterial color={gold} metalness={.62} roughness={.27}/>}

/** Actual sphere/torus/extruded meshes. No capsule artwork is used as a billboard. */
export function CapsuleModel({grade,compact=false}:{grade:number;compact?:boolean}){
 const color=COLORS[grade]??COLORS[4]
 if(grade===5)return <group>
  <mesh geometry={coinGeometry} position={[0,0,-.07]} dispose={null}><Gold/></mesh>
  <mesh position={[0,0,.12]}><torusGeometry args={[.76,.035,8,40]}/><Gold/></mesh>
  {[0,1,2,3].map(i=><mesh key={i} position={[Math.sin(i*Math.PI/2)*.54,Math.cos(i*Math.PI/2)*.54,.13]} rotation={[0,0,-i*Math.PI/2]}><boxGeometry args={[.28,.06,.06]}/><meshStandardMaterial color="#aa742c"/></mesh>)}
 </group>
 // Small capsules inside the jar share simpler real 3D ornament geometry.
 // The large result model retains the full detail.
 if(compact)return <group>
  <mesh><sphereGeometry args={[1,24,16]}/><meshPhysicalMaterial color={color} roughness={.25} metalness={.1} clearcoat={1}/></mesh>
  <mesh rotation={[Math.PI/2,0,0]}><torusGeometry args={[1.005,.065,8,32]}/><Gold/></mesh>
  <mesh position={[0,.97,0]}><sphereGeometry args={[.27,12,8]}/><Gold/></mesh>
  <mesh geometry={flowerGeometry} position={[0,0,1]} dispose={null}><Gold/></mesh>
  <mesh position={[0,0,1.055]}><sphereGeometry args={[.085,10,8]}/><meshStandardMaterial color="#fff0a6" metalness={.25} roughness={.2}/></mesh>
  <mesh position={[0,-.4,1]}><coneGeometry args={[.085,.3,8]}/><meshStandardMaterial color={color} roughness={.6}/></mesh>
  {grade===1&&<group position={[0,1.08,0]}>
   {[-1,0,1].map(x=><mesh key={x} position={[x*.2,.13,0]} rotation={[0,0,-x*.4]}><coneGeometry args={[.07,.32,6]}/><Gold/></mesh>)}
  </group>}
 </group>
 return <group>
  <mesh><sphereGeometry args={[1,32,24,0,Math.PI*2,0,Math.PI/2]}/><meshPhysicalMaterial color={color} roughness={.22} metalness={.08} clearcoat={1} clearcoatRoughness={.16}/></mesh>
  <mesh><sphereGeometry args={[1,32,24,0,Math.PI*2,Math.PI/2,Math.PI/2]}/><meshPhysicalMaterial color={color} roughness={.28} metalness={.12} clearcoat={.8}/></mesh>
  <mesh rotation={[Math.PI/2,0,0]}><torusGeometry args={[1.005,.065,10,40]}/><Gold/></mesh>
  <mesh position={[0,.97,0]}><sphereGeometry args={[.27,20,12]}/><Gold/></mesh>
  <mesh position={[0,-.95,0]} rotation={[Math.PI/2,0,0]}><torusGeometry args={[.3,.035,8,24]}/><Gold/></mesh>
  <group position={[0,0,1]}>
   {[0,1,2,3,4].map(i=><mesh key={i} position={[Math.sin(i*Math.PI*2/5)*.12,Math.cos(i*Math.PI*2/5)*.12,0]} scale={[.09,.14,.055]} rotation={[0,0,-i*Math.PI*2/5]}><sphereGeometry args={[1,12,8]}/><Gold/></mesh>)}
   <mesh position={[0,0,.045]}><sphereGeometry args={[.095,12,8]}/><meshStandardMaterial color={grade===1?'#ffbc54':'#fff0a6'} metalness={.25} roughness={.2}/></mesh>
   <mesh position={[0,-.23,0]}><sphereGeometry args={[.055,10,8]}/><Gold/></mesh>
   <mesh position={[0,-.4,0]}><coneGeometry args={[.085,.3,10]}/><meshStandardMaterial color={color} roughness={.6}/></mesh>
  </group>
  {[-1,1].map(side=><group key={side} position={[side*.48,.43,.77]} rotation={[0,side*.45,side*.3]}>
   <mesh><torusGeometry args={[.17,.025,6,16,Math.PI*1.6]}/><meshStandardMaterial color={grade===3?'#e9f5ff':grade===4?'#d3e39a':gold} metalness={.25} roughness={.3}/></mesh>
   <mesh position={[side*.08,-.16,0]}><torusGeometry args={[.11,.02,6,14,Math.PI*1.5]}/><meshStandardMaterial color={grade===3?'#e9f5ff':gold} roughness={.3}/></mesh>
  </group>)}
  {grade===1&&<group position={[0,1.08,0]}>
   <mesh><torusGeometry args={[.29,.045,8,24]}/><Gold/></mesh>
   {[-1,0,1].map(x=><mesh key={x} position={[x*.23,.16,0]} rotation={[0,0,-x*.4]}><coneGeometry args={[.09,.4,8]}/><Gold/></mesh>)}
   <mesh position={[0,.25,.055]} scale={[.09,.15,.055]}><sphereGeometry args={[1,12,8]}/><meshPhysicalMaterial color="#db2c31" clearcoat={1} roughness={.15}/></mesh>
  </group>}
 </group>
}
function Lights(){return <>
 <ambientLight intensity={1.4}/>
 <directionalLight position={[120,240,350]} intensity={3.4} color="#fff1d0"/>
 <directionalLight position={[-200,30,160]} intensity={1.8} color="#cbe9ff"/>
 <directionalLight position={[60,80,-100]} intensity={2.8} color="#ffcf7a"/>
</>}
function StageCamera(){
 const {camera,size}=useThree()
 useLayoutEffect(()=>{camera.zoom=size.width/1000;camera.updateProjectionMatrix()},[camera,size.width])
 return null
}
function MachineBalls({phase,phaseStartedAt,grade,reduced,onReady}:{phase:Phase;phaseStartedAt:number;grade?:number;reduced:boolean;onReady:()=>void}){
 const refs=useRef<(Group|null)[]>([]),rolled=useRef<Group>(null),handle=useRef<Group>(null)
 const pile=useMemo(()=>new CapsulePile(),[])
 const grades=useMemo(mixedVisualGrades,[])
 const prior=useRef({phase,reduced})
 const initial=useMemo(()=>pile.balls.map(b=>({position:[b.x,b.y,b.z] as [number,number,number],rotation:[b.rx,b.ry,b.rz] as [number,number,number]})),[pile])
 useEffect(onReady,[onReady])
 useFrame((_,delta)=>{
  const dt=Math.min(.1,delta),selected=grades.indexOf(grade??0)
  // Choreography shares the hook's monotonic wall clock, even at low FPS.
  const age=Math.max(0,(performance.now()-phaseStartedAt)/1000)
  const energetic=phase==='mixing'||phase==='turning'
  if(((phase==='reveal'||phase==='idle')&&prior.current.phase!==phase)||(reduced&&!prior.current.reduced))pile.settle()
  prior.current={phase,reduced}
  if(!reduced&&phase!=='idle'&&phase!=='reveal')pile.advance(dt,phase==='mixing'?1:phase==='turning'?.75:0)
  refs.current.forEach((ball,i)=>{
   if(!ball)return
   const winner=i===selected
   ball.visible=!(winner&&['drop','landed','anticipation','reveal'].includes(phase))
   const body=pile.balls[i]!
   ball.position.set(body.x,body.y,body.z)
   ball.rotation.set(body.rx,body.ry,body.rz)
  })
  if(handle.current&&!reduced&&energetic)handle.current.rotation.z-=dt*(phase==='turning'?8:4)
  if(rolled.current&&grade){
   const progress=phase==='drop'?Math.min(1,age/.48):1
   rolled.current.position.copy(outletStart).lerp(outletEnd,progress*progress)
   if(phase==='landed'){
    const u=Math.min(1,age/.3)
    rolled.current.position.y+=Math.sin(u*Math.PI)*5*(1-u)
   }
   if(!reduced){rolled.current.rotation.x=.12+progress*.16;rolled.current.rotation.z=.16-progress*.25;rolled.current.rotation.y=-.3}
  }
 })
 return <>
  {grades.map((g,i)=><group key={i} name={'gacha-globe-capsule-'+i} ref={ref=>{refs.current[i]=ref}} position={initial[i]!.position} rotation={initial[i]!.rotation} scale={18.5}><CapsuleModel grade={g} compact/></group>)}
  {grade&&['drop','landed','anticipation'].includes(phase)&&<group name="gacha-outlet-capsule" ref={rolled} position={outletStart.toArray()} scale={21}><CapsuleModel grade={grade}/></group>}
  <group position={[1,-60.75,22]} scale={32}>
   <mesh rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.24,.24,.16,24]}/><Gold/></mesh>
   <group ref={handle}>
    <mesh position={[.25,.27,.12]} rotation={[0,0,-.7]}><boxGeometry args={[.18,.74,.17]}/><Gold/></mesh>
    <mesh position={[.49,.54,.17]}><sphereGeometry args={[.22,16,12]}/><Gold/></mesh>
   </group>
  </group>
 </>
}
export function Machine3D({phase,phaseStartedAt,grade,reduced,onReady}:{phase:Phase;phaseStartedAt:number;grade?:number;reduced:boolean;onReady:()=>void}){
 return <div className="capsule-machine-3d" data-phase={phase}>
  <Canvas orthographic camera={{position:[0,0,800],near:.1,far:1600}} dpr={1} gl={{alpha:true,antialias:true}}
   frameloop={reduced||phase==='idle'||phase==='reveal'?'demand':'always'}
   fallback={<span className="capsule-3d-failure">3D 연출을 불러오지 못했어요. 뽑기 화면을 다시 열어 주세요.</span>}>
   <StageCamera/><Lights/><MachineBalls phase={phase} phaseStartedAt={phaseStartedAt} grade={grade} reduced={reduced} onReady={onReady}/>
  </Canvas>
 </div>
}
function HeroModel({grade,reduced}:{grade:number;reduced:boolean}){
 const model=useRef<Group>(null)
 useFrame((_,dt)=>{if(!model.current||reduced)return;model.current.rotation.y+=Math.min(dt,.03)*.18})
 return <group ref={model} rotation={[.08,0,0]} scale={.95}><CapsuleModel grade={grade}/></group>
}
export function CapsuleHero3D({grade,reduced}:{grade:number;reduced:boolean}){
 return <div className="capsule-hero capsule-hero-3d" role="img" aria-label={grade===5?'입체 엽전':`입체 ${capsuleName(grade)}`} data-asset-grade={grade===5?'coin':5-grade}>
  <Canvas resize={{offsetSize:true}} camera={{position:[0,0,grade===1?4:3.6],fov:40}} dpr={1} gl={{alpha:true,antialias:true}} frameloop={reduced?'demand':'always'}>
   <Lights/><HeroModel grade={grade} reduced={reduced}/>
  </Canvas>
 </div>
}
