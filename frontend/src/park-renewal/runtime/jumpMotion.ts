import {createJumpState} from '../jump10Simulation'
import {JUMP_SEQUENCE,containsPad,isJumpPadVisible,type JumpPad} from '../jump10Plan'
import {advancePadContact,jumpPadPose,padContact} from '../jumpGimmicks'
import {useJumpmap} from '../../features/jumpmap/state'
import {estimatedServerTime} from '../../network/serverEventClock'

/** Shared presentation/prediction clock. It never starts a run or grants coins. */
export const renewalJumpMotion=createJumpState()
let runId=''
let contactId='',contactSince=0
export function syncJumpMotion(now=estimatedServerTime()/1000){
 const s=useJumpmap.getState(),id=s.available?s.run?.runId??'':''
 if(id!==runId){runId=id;renewalJumpMotion.contacts.clear();renewalJumpMotion.pad=null;contactId='';contactSince=now}
 renewalJumpMotion.active=!!id;renewalJumpMotion.time=now
 return renewalJumpMotion
}
export function visibleJumpPad(p:JumpPad){return isJumpPadVisible(p,renewalJumpMotion.active)}
export function renewalPadAt(feet:{x:number;y:number;z:number},tolerance=.18){
 return JUMP_SEQUENCE.find(p=>{const pose=jumpPadPose(p,renewalJumpMotion);return visibleJumpPad(p)&&pose.solid&&Math.abs(feet.y-pose.height)<=tolerance&&containsPad(p,feet.x,feet.z)})
}
export function updateJumpContact(feet:{x:number;y:number;z:number}|undefined,dt:number,now=estimatedServerTime()/1000){
 const s=syncJumpMotion(now),p=feet?renewalPadAt(feet):undefined
 if(contactId!==(p?.id??'')){contactId=p?.id??'';contactSince=now}
 if(p&&p.id!==s.pad?.id&&p.theme==='mole')padContact(s,p).hitAt=s.time
 if(p?.theme==='lily')padContact(s,p).stood=Math.max(0,now-contactSince)
 s.pad=p??null;advancePadContact(s,p??null,0)
 void dt // Wall clock keeps the 3-second hold exact at different render rates.
}
