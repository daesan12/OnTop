import { useEffect, useMemo, useState } from 'react'
import { Object3D } from 'three'
import { createRoot } from 'react-dom/client'
import { Canvas, useFrame } from '@react-three/fiber'
import { TraditionalNotesBoard } from '../world/art/TraditionalNotesBoard'
import { NOTES_BOARD_SCALE } from '../world/art/notesBoardLayout'
import { NOTES_BOX } from '../config/notes'
import { EXPECTED_MAP_VERSION } from '../config/mapVersion'
import { receive } from '../network/worldClient'
import { openNotes } from '../features/notes/controller'
import { AnonymousNotes } from '../features/notes/AnonymousNotes'
import { notesService } from '../features/notes/service'
import { MockNotesService } from '../features/notes/mock/MockNotesService'
import { useNotesState } from '../features/notes/state'
import { roamingInput } from '../world/inputOwnership'
import '../styles.css'
import './preview.css'

// Deliberately isolated dev entry: never restores auth or starts HTTP/WS transport.
if (!import.meta.env.DEV || import.meta.env.MODE !== 'notes-preview') throw new Error('로컬 notes-preview 모드로 열어주세요.')
roamingInput.ready = true
receive({ type:'CONNECTED',payload:{userId:'preview-user'},requestId:null })
receive({ type:'CHANNEL_STATE',payload:{channelId:'preview-channel',name:'전망대 로컬 메모함',version:1,currentUsers:1,capacity:16,userIds:['preview-user']},requestId:null })
receive({ type:'WORLD_STATE',payload:{channelId:'preview-channel',version:1,mapVersion:EXPECTED_MAP_VERSION,avatars:[{userId:'preview-user',position:{x:NOTES_BOX.x,y:NOTES_BOX.y+.8,z:NOTES_BOX.z+1.6,yaw:Math.PI,moving:false,running:false,swimming:false,lastInputSeq:0}}]},requestId:null })
const mock=new MockNotesService(550)
function Camera({yaw}:{yaw:number}){
 useFrame(({camera})=>{camera.position.set(NOTES_BOX.x+Math.sin(yaw)*3.4*NOTES_BOARD_SCALE,NOTES_BOX.y+1.45*NOTES_BOARD_SCALE,NOTES_BOX.z+Math.cos(yaw)*3.4*NOTES_BOARD_SCALE);camera.lookAt(NOTES_BOX.x,NOTES_BOX.y+.9*NOTES_BOARD_SCALE,NOTES_BOX.z)})
 return null
}
function Preview(){
 const sunTarget=useMemo(()=>{const target=new Object3D();target.position.set(NOTES_BOX.x,NOTES_BOX.y+.9*NOTES_BOARD_SCALE,NOTES_BOX.z);return target},[])
 const [failure,setFailure]=useState(false),[yaw,setYaw]=useState(.1),opened=useNotesState(s=>s.open)
 const open=()=>{
  if(useNotesState.getState().open)return
  notesService.read=mock.read.bind(mock);notesService.subscribe=mock.subscribe.bind(mock)
  notesService.submit=(scope,submission,signal)=>failure?new Promise((_,reject)=>setTimeout(()=>reject(new Error('미리보기 전송 실패입니다. 작성한 메모는 그대로 남아 있어요.')),550)):mock.submit(scope,submission,signal)
  openNotes()
 }
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.code==='KeyE'&&!e.repeat&&!useNotesState.getState().open){e.preventDefault();open()}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[failure])
 return <main className="notes-preview-page">
  <Canvas shadows camera={{fov:40,near:.1,far:80}} dpr={[1,1.5]}>
   <color attach="background" args={['#aec7cf']}/><fog attach="fog" args={['#aec7cf',15,45]}/>
   <hemisphereLight color="#f2ecd9" groundColor="#626952" intensity={1.95}/><ambientLight intensity={.35}/>
   <primitive object={sunTarget}/>
   <directionalLight target={sunTarget} position={[NOTES_BOX.x-4,NOTES_BOX.y+7,NOTES_BOX.z+5]} intensity={2.0} color="#fff0d5" castShadow shadow-mapSize={[2048,2048]} shadow-camera-left={-3} shadow-camera-right={3} shadow-camera-top={3} shadow-camera-bottom={-3} shadow-camera-near={.1} shadow-camera-far={25} shadow-bias={-.0003} shadow-normalBias={.004}/>
   <group position={[NOTES_BOX.x,NOTES_BOX.y,NOTES_BOX.z]}>
    <mesh receiveShadow position={[0,-.07,0]}><boxGeometry args={[7,.14,6]}/><meshStandardMaterial color="#a98e69" roughness={.9}/></mesh>
    {Array.from({length:13},(_,i)=><mesh key={i} position={[-3.2+i*.53,.008,0]}><boxGeometry args={[.012,.01,6]}/><meshStandardMaterial color="#806b4c"/></mesh>)}
    {[-2.3,-1.3,-.3,.7,1.7,2.7].map(x=><mesh key={x} position={[x,.55,-1.8]}><boxGeometry args={[.09,1.1,.09]}/><meshStandardMaterial color="#71583d"/></mesh>)}
    {[.32,1].map(y=><mesh key={y} position={[0,y,-1.8]}><boxGeometry args={[6,.085,.12]}/><meshStandardMaterial color="#856440"/></mesh>)}
    {Array.from({length:16},(_,i)=><mesh key={i} position={[Math.sin(i*7)*17,-1.8+Math.sin(i*3),-12-i*.2]}><boxGeometry args={[1.1,3+(i%4),1.1]}/><meshStandardMaterial color={i%2?'#a3b6b9':'#899fa5'}/></mesh>)}
   </group><TraditionalNotesBoard/><Camera yaw={yaw}/>
  </Canvas>
  <header className="notes-preview-toolbar"><div><strong>전망대 · 온탑 메모함</strong><small>로컬 디자인 미리보기 · 실제 메모는 저장되지 않아요.</small></div><div>
   <label><input type="checkbox" checked={failure} disabled={opened} onChange={e=>setFailure(e.target.checked)}/> 전송 실패 확인</label>
   <button disabled={opened} onClick={()=>setYaw(y=>y+Math.PI/4)}>에셋 회전</button><button disabled={opened} onClick={open}>E · 메모함 열기</button></div></header>
  {!opened&&<div className="notes-preview-hint"><kbd>E</kbd> 여기에 마음 한 장 남겨보세요<small>주제를 고르고, 만년필로 적어, 메모함에 붙여요.</small></div>}
  <AnonymousNotes/>
 </main>
}
createRoot(document.getElementById('root')!).render(<Preview/> )
