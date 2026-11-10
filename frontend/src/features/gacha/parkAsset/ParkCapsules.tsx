import {useLayoutEffect,useMemo,useRef} from 'react'
import {useFrame} from '@react-three/fiber'
import {Color,Euler,Matrix4,Quaternion,Sphere,Vector3,type Group,type InstancedMesh} from 'three'
import {PARK_CAPSULES} from './gachaMachineGeometry'
import {capsuleGold,capsuleShellMaterial,worldCapsuleColors} from './gachaMaterials'
import {buildCapsuleBatchGeometry,capsuleTransform} from './capsuleBatchGeometry'
import {cueAge,useGachaMixCue} from './gachaMixCue'
import {CAPSULE_POSE_STRIDE,capsuleMotionScale,projectCapsuleToPanel,sampleCapsuleMix} from './capsuleMixMotion'
import {MIX_DURATION_MS,mixPhase} from './gachaMixTiming'

const geometry=buildCapsuleBatchGeometry()
export function ParkCapsules({panel=false}:{panel?:boolean}){
 const shells=useRef<InstancedMesh>(null),trim=useRef<InstancedMesh>(null)
 const group=useRef<Group>(null),prior=useRef({id:-1,age:-2})
 const metadata=useMemo(()=>({capsuleCount:PARK_CAPSULES.length,phase:'idle',updates:0}),[])
 const work=useMemo(()=>({poses:new Float32Array(18*CAPSULE_POSE_STRIDE),matrix:new Matrix4(),position:new Vector3(),scale:new Vector3(),rotation:new Euler(),quaternion:new Quaternion(),gold:new Color('#e6b64b')}),[])
 const apply=(age:number,grade:number)=>{
  const a=shells.current!,b=trim.current!,{poses,matrix,position,scale,rotation,quaternion}=work
  const winner=sampleCapsuleMix(age,grade,poses)
  for(let i=0;i<18;i++){
   const k=i*CAPSULE_POSE_STRIDE
   if(panel)projectCapsuleToPanel(age,i,winner,poses)
   position.set(poses[k]!,poses[k+1]!,poses[k+2]!);rotation.set(poses[k+4]!,poses[k+5]!,poses[k+6]!);quaternion.setFromEuler(rotation)
   scale.setScalar(capsuleMotionScale*poses[k+3]!*(panel?59:1));matrix.compose(position,quaternion,scale)
   a.setMatrixAt(i,matrix);b.setMatrixAt(i,matrix)
   a.setColorAt(i,age>=0&&grade===5&&i===winner?work.gold:worldCapsuleColors[i%4]!)
  }
  a.instanceMatrix.needsUpdate=true;b.instanceMatrix.needsUpdate=true;a.instanceColor!.needsUpdate=true
  if(group.current){const d=group.current.userData;d.phase=mixPhase(age);d.elapsedMs=age;d.winner=age<0?null:winner;d.jarCount=age>=2300?17:18;d.outletCount=age>=2500?1:0;d.updates=(d.updates??0)+1}
 }
 useLayoutEffect(()=>{
  const a=shells.current!,b=trim.current!
  for(let i=0;i<PARK_CAPSULES.length;i++){
   const matrix=capsuleTransform(i);a.setMatrixAt(i,matrix);b.setMatrixAt(i,matrix);a.setColorAt(i,worldCapsuleColors[i%4]!)
  }
  a.instanceMatrix.needsUpdate=true;b.instanceMatrix.needsUpdate=true;a.instanceColor!.needsUpdate=true
  // Fixed conservative bounds include the jar and tray; avoid 18-instance bound scans each frame.
  a.boundingSphere=new Sphere(new Vector3(0,panel?0:2.6,panel?30:.7),panel?260:3.1);b.boundingSphere=a.boundingSphere.clone()
  if(panel)apply(-1,1)
  return()=>{a.dispose();b.dispose()}
 },[panel])
 useFrame(()=>{
  const {cue}=useGachaMixCue.getState(),age=cueAge(cue),id=cue?.id??0
  if(prior.current.id===id&&(age<0||age>=MIX_DURATION_MS)&&prior.current.age===age)return
  if(!cue&&!panel){prior.current={id,age};return}
  apply(age,cue?.grade??1);prior.current.id=id;prior.current.age=age
 })
 return <group ref={group} name={panel?'gacha-panel-capsule-pile':'gacha-capsule-pile'} userData={metadata}>
  <instancedMesh name="gacha-capsule-shells" ref={shells} args={[geometry.shell,capsuleShellMaterial,PARK_CAPSULES.length]} dispose={null}/>
  <instancedMesh name="gacha-capsule-trim" ref={trim} args={[geometry.trim,capsuleGold,PARK_CAPSULES.length]} dispose={null}/>
 </group>
}
