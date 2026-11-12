import {useEffect,useRef,useState} from 'react'
import {useFrame} from '@react-three/fiber'
import type {Group} from 'three'
import {CustomerModelPoolV5} from '../bungeoppang/customerModelV5'
import {CUSTOMER_ASSETS_V5} from '../bungeoppang/customerAssetsV5'
import {instantiateResident,RESIDENT_LOOKS,type ResidentKind} from './residentRig'
import {CharacterModel} from '../../ai-lab/CharacterModel'

const pool=new CustomerModelPoolV5()
export function ResidentModel({kind,speed,seated=false,airborne=false,talking=false}:{kind:ResidentKind;speed:{current:number};seated?:boolean;airborne?:boolean;talking?:boolean}) {
 const host=useRef<Group>(null),instance=useRef<ReturnType<typeof instantiateResident>|null>(null),[failed,setFailed]=useState(false)
 useEffect(()=>{let active=true;const root=host.current!,asset=CUSTOMER_ASSETS_V5.find(a=>a.id===RESIDENT_LOOKS[kind].id)!,lease=pool.acquire(asset)
  setFailed(false);root.userData.loadError=false
  void lease.ready.then(source=>{if(!active)return;const actor=instantiateResident(source,kind);instance.current=actor;root.add(actor.root);root.userData.loaded=true}).catch(()=>{if(active){root.userData.loadError=true;setFailed(true)}})
  return()=>{active=false;instance.current?.dispose();instance.current=null;lease.release();root.userData.loaded=false}
 },[kind])
 useFrame((_,dt)=>instance.current?.update(Math.min(.1,dt),speed.current,seated,airborne,talking))
 return <group ref={host} name={'detailed-npc-'+kind}>{failed&&<group scale={RESIDENT_LOOKS[kind].height/2.1}><CharacterModel role={kind==='POLICE'?'POLICE':kind==='ELDER'?'GUIDE':'VISITOR'} moving={speed.current>.1} talking={talking} motionSpeed={speed} airborne={airborne}/></group>}</group>
}
