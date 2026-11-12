import {useEffect,useRef,useState} from 'react'
import {useFrame} from '@react-three/fiber'
import {Group,Sphere,Vector3} from 'three'
import {CustomerModelPoolV5} from '../bungeoppang/customerModelV5'
import {instantiateResident,RESIDENT_LOOKS,type ResidentKind} from './residentRig'
import {CharacterModel} from '../../ai-lab/CharacterModel'
import {npcFrameView} from './npcFrameView'
import {OMOK_FOCUS_LAYER} from '../../world/omokCamera'

const pool=new CustomerModelPoolV5()
export function ResidentModel({kind,speed,seated=false,airborne=false,talking=false}:{kind:ResidentKind;speed:{current:number};seated?:boolean;airborne?:boolean;talking?:boolean}) {
 const host=useRef<Group>(null),instance=useRef<ReturnType<typeof instantiateResident>|null>(null),[failed,setFailed]=useState(false)
 const frame=useRef({ elapsed:0, center:new Vector3(), sphere:new Sphere(new Vector3(),3), visible:true })
 useEffect(()=>{let active=true;const root=host.current!,asset=RESIDENT_LOOKS[kind],lease=pool.acquire(asset)
  setFailed(false);root.userData.loadError=false
  void lease.ready.then(source=>{if(!active)return;const actor=instantiateResident(source,kind);instance.current=actor;root.add(actor.root);root.userData.loaded=true}).catch(()=>{if(active){root.userData.loadError=true;setFailed(true)}})
  return()=>{active=false;instance.current?.dispose();instance.current=null;lease.release();root.userData.loaded=false}
 },[kind])
 useFrame(({camera,size,clock,gl},dt)=>{
  const resident=instance.current,group=host.current
  if(!resident||!group)return
  const state=frame.current
  if(group.parent?.visible===false||camera.layers.mask===1<<OMOK_FOCUS_LAYER){
   resident.root.visible=false
   state.visible=false
   state.elapsed=0
   return
  }
  group.getWorldPosition(state.center)
  const distanceSquared=camera.position.distanceToSquared(state.center)
  const {frustum}=npcFrameView(camera,size.width,size.height,clock.elapsedTime)
  state.sphere.center.copy(state.center).y+=1.25
  // Keep close off-camera actors active for their visible shadows.
  const xr=gl.xr.isPresenting
  const visible=xr||distanceSquared<=100||frustum.intersectsSphere(state.sphere)
  resident.root.visible=visible
  if(!visible){
   state.visible=false
   state.elapsed=0
   return
  }
  state.elapsed+=dt
  if(!xr&&state.visible&&distanceSquared>24**2&&!airborne&&!talking&&state.elapsed<.05)return
  state.visible=true
  resident.update(Math.min(.1,state.elapsed),speed.current,seated,airborne,talking)
  state.elapsed=0
 },.75)
 return <group ref={host} name={'detailed-npc-'+kind}>{failed&&<group scale={RESIDENT_LOOKS[kind].height/2.1}><CharacterModel role={kind==='POLICE'?'POLICE':kind==='ELDER'?'GUIDE':'VISITOR'} moving={speed.current>.1} talking={talking} motionSpeed={speed} airborne={airborne}/></group>}</group>
}
