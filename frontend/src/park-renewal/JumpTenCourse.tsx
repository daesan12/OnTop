import {useLayoutEffect,useMemo,useRef,type RefObject} from 'react'
import {useFrame} from '@react-three/fiber'
import {Object3D,DynamicDrawUsage,InstancedBufferAttribute,MeshLambertMaterial,type InstancedMesh,type BufferGeometry} from 'three'
import {creatureJumpArt} from './creatureJumpArt'
import {jumpArt} from '../layout-preview/jumpGeometry'
import {JUMP_PADS,JUMP_GATES,JUMP_FINISH,DEV_JUMP_TRANSLATION,type JumpTheme,type JumpPad} from './jump10Plan'
import {coursePadFade,applyJumpFadeShader} from '../features/jumpmap/visibility'
import {cameraWorldPosition,parkXRView} from '../world/xrView'
import {type JumpState} from './jump10Simulation'
import {jumpPadPose} from './jumpGimmicks'
const root=new Object3D()
function Batch({geometry,pads,stateRef,color='#ffffff'}:{geometry:BufferGeometry;pads:readonly JumpPad[];stateRef:RefObject<JumpState>;color?:string}){
 const ref=useRef<InstancedMesh>(null)
 const art=useMemo(()=>{const g=geometry.clone();g.setAttribute('aFade',new InstancedBufferAttribute(new Float32Array(pads.length).fill(.15),1));return g},[geometry,pads])
 const material=useMemo(()=>{const m=new MeshLambertMaterial({color,vertexColors:true});m.onBeforeCompile=applyJumpFadeShader;m.customProgramCacheKey=()=>`renewal-dev-pad-fade-v1`;return m},[color])
 const update=(eye?:{x:number;y:number;z:number},dt=.016)=>{const mesh=ref.current;if(!mesh)return;const state=stateRef.current,fade=art.getAttribute('aFade')as InstancedBufferAttribute,dx=(eye?.x??state.x)-state.x,dy=(eye?.y??state.y+1.2)-state.y-1.2,dz=(eye?.z??state.z)-state.z,length=dx*dx+dy*dy+dz*dz
  pads.forEach((p,i)=>{const pose=jumpPadPose(p,state),shown=pose.visible,along=length?((p.x-state.x)*dx+(pose.height-state.y-1.2)*dy+(p.z-state.z)*dz)/length:0,occluded=along>.03&&along<.97&&Math.hypot(p.x-state.x-dx*along,pose.height-state.y-1.2-dy*along,p.z-state.z-dz*along)<Math.max(p.halfX,p.halfZ)+.5,target=parkXRView.active?1:coursePadFade(p.stage,p.height-DEV_JUMP_TRANSLATION.y,state.y-DEV_JUMP_TRANSLATION.y,state.active,state.pad?.id===p.id,occluded)
   fade.setX(i,target+(fade.getX(i)-target)*Math.exp(-Math.min(dt,.1)*6))
   root.position.set(p.x,pose.height,p.z);root.rotation.set(0,p.yaw,0)
   const sx=p.stage<6?(p.theme==='stone'?p.halfX/.9:1):p.theme==='duck'?p.halfX/.68:p.theme==='mole'?p.radius!/.68:p.theme==='pigeon'?p.radius!/.72:p.theme==='lily'?p.radius!:1,sz=p.stage<6?(p.theme==='stone'?p.halfZ/.9:1):p.theme==='duck'?p.halfZ/.9:sx
   root.scale.set(shown?sx:0,shown?1:0,shown?sz:0);root.updateMatrix();mesh.setMatrixAt(i,root.matrix)
  });mesh.instanceMatrix.needsUpdate=true;fade.needsUpdate=true
 }
 useLayoutEffect(()=>{ref.current!.instanceMatrix.setUsage(DynamicDrawUsage);update(undefined,1);return()=>{art.dispose();material.dispose()}},[art,material,pads])
 useFrame(({camera},dt)=>update(cameraWorldPosition(camera),dt))
 return <instancedMesh ref={ref} name={`jump-batch-${pads[0]?.theme}`} userData={{padIds:pads.map(p=>p.id),devFade:true}} args={[art,material,pads.length]} frustumCulled={false}/>
}
const batches=(['stone','gomoku','fish','cloud','lantern','kite','lily','pigeon','mole','duck','gate']as JumpTheme[]).flatMap<{key:string;theme:JumpTheme;pads:JumpPad[];color:string}>(theme=>{const all=[...JUMP_PADS,...JUMP_GATES].filter(p=>p.theme===theme);return theme==='gomoku'?[{key:'gomoku-white',theme,pads:all.filter(p=>p.stoneTone==='white'),color:'#ffffff'},{key:'gomoku-black',theme,pads:all.filter(p=>p.stoneTone==='black'),color:'#24292a'}]:[{key:theme,theme,pads:all,color:'#ffffff'}]})
const art={...jumpArt,...creatureJumpArt}
export function JumpTenCourse({started,stateRef}:{started:boolean;preview?:boolean;stateRef:RefObject<JumpState>}){return <group name="ten-stage-pagoda-to-lake-course" userData={{stages:10,pads:JUMP_PADS.length,gates:9,started,localOnly:true}}>
 {batches.map(({key,theme,pads,color})=><group key={key}>{Object.entries(art[theme]).map(([finish,g])=><Batch key={finish} geometry={g} color={color} stateRef={stateRef} pads={pads}/>)}</group>)}
 {started&&<mesh position={[JUMP_FINISH.x,JUMP_FINISH.y,JUMP_FINISH.z]} rotation={[-Math.PI/2,0,0]}><ringGeometry args={[1.75,2,48]}/><meshBasicMaterial color="#d2ad55" side={2}/></mesh>}
 </group>}
