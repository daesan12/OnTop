import {useContext,useEffect,useRef,useState} from 'react'
import {useFrame} from '@react-three/fiber'
import {Group,Sphere,Vector3} from 'three'
import {CustomerModelPoolV5} from '../bungeoppang/customerModelV5'
import {instantiateResident,RESIDENT_LOOKS,type ResidentKind} from './residentRig'
import {npcFrameView} from './npcFrameView'
import {OMOK_FOCUS_LAYER} from '../../world/omokCamera'
import {ResidentLoading} from './residentLoading'
import {ResidentLoadQueue} from './residentLoadQueue'

const pool=new CustomerModelPoolV5()
const loads=new ResidentLoadQueue()
const maxLoadAttempts=3
export function ResidentModel({kind,speed,seated=false,airborne=false,talking=false}:{kind:ResidentKind;speed:{current:number};seated?:boolean;airborne?:boolean;talking?:boolean}) {
 const enabled=useContext(ResidentLoading)
 const host=useRef<Group>(null),instance=useRef<ReturnType<typeof instantiateResident>|null>(null),[wanted,setWanted]=useState(false)
 const distance=useRef(Infinity)
 const frame=useRef({ elapsed:0, center:new Vector3(), sphere:new Sphere(new Vector3(),3), visible:true })
 useEffect(()=>{
  if(!enabled||!wanted)return
  let active=true,lease:ReturnType<typeof pool.acquire>|undefined,attempts=0
  let retryTimer:ReturnType<typeof setTimeout>|undefined,cancel=()=>{}
  const root=host.current!
  root.userData.loadError=false;root.userData.loadAttempts=0
  const release=()=>{lease?.release();lease=undefined}
  const enqueue=()=>{retryTimer=undefined;cancel=loads.enqueue(async()=>{
   if(!active)return
   root.userData.loadAttempts=++attempts
   root.userData.loadError=false
   performance.mark('park-resident-load-start-'+kind)
   try {
    lease=pool.acquire(RESIDENT_LOOKS[kind])
    const source=await lease.ready
    if(!active)return
    performance.mark('park-resident-clone-start-'+kind)
    const actor=instantiateResident(source,kind)
    instance.current=actor;root.add(actor.root);root.userData.loaded=true;root.userData.loadError=false
    performance.mark('park-resident-clone-end-'+kind)
   } catch(error) {
    // A rejected lease stays cached while held. Release it before reacquiring,
    // and wait outside the queue so other residents can finish during backoff.
    release()
    if(!active)return
    root.userData.loadError=true
    if(attempts<maxLoadAttempts)retryTimer=setTimeout(enqueue,1000*2**(attempts-1))
    else console.warn('[park-resident] NPC model could not be loaded', {kind,attempts}, error)
   }
  },()=>distance.current)}
  enqueue()
  return()=>{active=false;cancel();clearTimeout(retryTimer);instance.current?.dispose();instance.current=null;release();root.userData.loaded=false}
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
 // Attach only the finished resident; a different temporary character visibly morphs on load.
 return <group ref={host} name={'detailed-npc-'+kind}/>
}
