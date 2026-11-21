import {useContext,useEffect,useRef,useState} from 'react'
import {useFrame} from '@react-three/fiber'
import {Group,Sphere,Vector3} from 'three'
import {CustomerModelPoolV5} from '../bungeoppang/customerModelV5'
import {instantiateResident,RESIDENT_LOOKS,type ResidentKind} from './residentRig'
import {CharacterModel} from '../../ai-lab/CharacterModel'
import {npcFrameView} from './npcFrameView'
import {OMOK_FOCUS_LAYER} from '../../world/omokCamera'
import {ResidentLoading} from './residentLoading'
import {ResidentLoadQueue} from './residentLoadQueue'

const pool=new CustomerModelPoolV5()
const loads=new ResidentLoadQueue()
export function ResidentModel({kind,speed,seated=false,airborne=false,talking=false}:{kind:ResidentKind;speed:{current:number};seated?:boolean;airborne?:boolean;talking?:boolean}) {
 const enabled=useContext(ResidentLoading)
 const host=useRef<Group>(null),instance=useRef<ReturnType<typeof instantiateResident>|null>(null),[loaded,setLoaded]=useState(false),[wanted,setWanted]=useState(false)
 const distance=useRef(Infinity)
 const frame=useRef({ elapsed:0, center:new Vector3(), sphere:new Sphere(new Vector3(),3), visible:true })
 useEffect(()=>{
  if(!enabled||!wanted)return
  let active=true,lease:ReturnType<typeof pool.acquire>|undefined
  const root=host.current!
  setLoaded(false);root.userData.loadError=false
  const cancel=loads.enqueue(async()=>{
   if(!active)return
   performance.mark('park-resident-load-start-'+kind)
   lease=pool.acquire(RESIDENT_LOOKS[kind])
   try {
    const source=await lease.ready
    if(!active)return
    performance.mark('park-resident-clone-start-'+kind)
    const actor=instantiateResident(source,kind)
    instance.current=actor;root.add(actor.root);root.userData.loaded=true;setLoaded(true)
    performance.mark('park-resident-clone-end-'+kind)
   } catch {if(active)root.userData.loadError=true}
  },()=>distance.current)
  return()=>{active=false;cancel();instance.current?.dispose();instance.current=null;lease?.release();root.userData.loaded=false}
 },[kind,enabled,wanted])
 useFrame(({camera,size,clock,gl},dt)=>{
  const resident=instance.current,group=host.current
  if(!group)return
  const state=frame.current
  if(group.parent?.visible===false||camera.layers.mask===1<<OMOK_FOCUS_LAYER){
   if(resident)resident.root.visible=false
   state.visible=false
   state.elapsed=0
   return
  }
  group.getWorldPosition(state.center)
  const distanceSquared=camera.position.distanceToSquared(state.center)
  distance.current=distanceSquared
  if(enabled&&!wanted&&distanceSquared<=90**2)setWanted(true)
  if(!resident)return
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
 // Distance only gates detailed GLB work; keep the cheap actor visible as soon as enabled.
 return <group ref={host} name={'detailed-npc-'+kind}>{enabled&&!loaded&&<group scale={RESIDENT_LOOKS[kind].height/2.1}><CharacterModel role={kind==='POLICE'?'POLICE':kind==='ELDER'?'GUIDE':'VISITOR'} moving={speed.current>.1} talking={talking} motionSpeed={speed} airborne={airborne}/></group>}</group>
}
