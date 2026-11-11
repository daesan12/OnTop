import {useEffect,useRef,useState} from 'react'
import {createRoot} from 'react-dom/client'
import {Canvas,useThree} from '@react-three/fiber'
import {OrbitControls} from 'three/addons/controls/OrbitControls.js'
import {ResidentModel} from '../features/ai/ParkNpcModel'
import type {ResidentKind} from '../features/ai/residentRig'

function Camera(){const {camera,gl}=useThree();useEffect(()=>{const controls=new OrbitControls(camera,gl.domElement);controls.target.set(0,1,0);controls.enablePan=false;controls.minDistance=4;controls.maxDistance=12;controls.update();return()=>controls.dispose()},[camera,gl]);return null}
function Actor({kind,index,walking,seated,airborne}:{kind:ResidentKind;index:number;walking:boolean;seated:boolean;airborne:boolean}){const speed=useRef(0);speed.current=walking?2.4:0;return <group position={[(index-1.5)*1.7,airborne?.4:0,0]}><ResidentModel kind={kind} speed={speed} seated={seated} airborne={airborne}/>{seated&&<mesh position={[0,.35,0]}><cylinderGeometry args={[.30,.28,.70,16]}/><meshStandardMaterial color="#705442"/></mesh>}</group>}
function Preview(){const [walking,setWalking]=useState(false),[seated,setSeated]=useState(false),[airborne,setAirborne]=useState(false)
 return <main style={{height:'100vh',background:'#e7e4dc',fontFamily:'sans-serif',color:'#273d35'}}><header style={{position:'absolute',zIndex:2,padding:'18px 24px'}}><h2 style={{margin:'0 0 10px'}}>OnTop · 마을 주민</h2><button onClick={()=>{setWalking(v=>!v);setSeated(false);setAirborne(false)}}>{walking?'멈추기':'걸음 보기'}</button> <button onClick={()=>{setSeated(v=>!v);setWalking(false);setAirborne(false)}}>착석 자세</button> <button onClick={()=>{setAirborne(v=>!v);setWalking(false);setSeated(false)}}>점프 자세</button><p>한순경 · 강잼민 · 윤한수 · 박영감 · 드래그하여 회전</p></header>
 <Canvas shadows camera={{position:[0,2.7,9],fov:36}}><color attach="background" args={['#e7e4dc']}/><ambientLight intensity={1.2}/><hemisphereLight args={['#f3f8ff','#b1a48c',2]}/><directionalLight position={[4,7,5]} intensity={2.6} castShadow shadow-mapSize={[2048,2048]} shadow-camera-left={-6} shadow-camera-right={6} shadow-camera-top={5} shadow-camera-bottom={-5}/><directionalLight position={[-5,3,-3]} intensity={1.1}/><Camera/>{(['POLICE','CHILD','NEIGHBOR','ELDER'] as ResidentKind[]).map((kind,i)=><Actor key={kind} kind={kind} index={i} walking={walking} seated={seated} airborne={airborne}/>)}<mesh rotation={[-Math.PI/2,0,0]} receiveShadow><planeGeometry args={[200,200]}/><meshStandardMaterial color="#d9d5c8" roughness={1}/></mesh></Canvas></main>
}
if(import.meta.env.DEV&&['127.0.0.1','localhost'].includes(location.hostname)){
 const root=createRoot(document.getElementById('root')!);root.render(<Preview/>);
 if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount())
}
