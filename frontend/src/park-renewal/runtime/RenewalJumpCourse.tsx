import {useRef} from 'react'
import {useFrame} from '@react-three/fiber'
import {JumpTenCourse} from '../JumpTenCourse'
import {useJumpmap} from '../../features/jumpmap/state'
import {avatars,sampleAvatar,useSession} from '../../network/worldClient'
import {renewalJumpMotion,updateJumpContact} from './jumpMotion'

export function RenewalJumpCourse(){
 const started=useJumpmap(s=>s.available&&!!s.run),ref=useRef(renewalJumpMotion)
 useFrame((_,dt)=>{const a=avatars.get(useSession.getState().sessionId),p=a&&sampleAvatar(a,performance.now(),{...a.current});updateJumpContact(p?{x:p.x,y:p.y-.8,z:p.z}:undefined,dt)},-2)
 return <JumpTenCourse stateRef={ref} started={started}/>
}
