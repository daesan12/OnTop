import {JUMP_START,JUMP_FINISH,JUMP_PADS,JUMP_GATES,JUMP_REWARDS,containsPad,inFinish,isJumpPadVisible,type JumpPad} from './jump10Plan.ts'
import {advancePadContact,jumpPadPose,padContact,type PadContact} from './jumpGimmicks.ts'
import {heightAt,inLake,LAKE} from './plan.ts'
import {clearMotionSegment} from './motionPlan.ts'
export const JUMP_RULES={walk:6.25,run:9,speed:6.2,gravity:18,terminal:20,step:.22,buffer:.15,coyote:.1} as const
export function createJumpState(){return {x:JUMP_START.x,y:JUMP_START.y,z:JUMP_START.z,vy:0,time:0,grounded:true,pad:null as JumpPad|null,queued:-1,active:false,nextGate:1,finalDuck:false,coins:0,settled:new Set<number>(),contacts:new Map<string,PadContact>(),phase:'ready' as 'ready'|'running'|'fall'|'complete',stage:1,leftAt:-999,jumped:false}}
export type JumpState=ReturnType<typeof createJumpState>
export function queueJump(s:JumpState){s.queued=s.time+JUMP_RULES.buffer}
function rewardStage(s:JumpState,stage:number){if(s.settled.has(stage))return;s.settled.add(stage);s.coins+=JUMP_REWARDS[stage-1]??0}
export function landPad(s:JumpState,p:JumpPad){
 if(p.id===JUMP_PADS[0]!.id&&!s.active){s.active=true;s.nextGate=1;s.stage=1;s.finalDuck=false;s.coins=0;s.settled.clear();s.contacts.clear();s.phase='running'}
 if(s.active&&p.gate===s.nextGate){rewardStage(s,p.gate);s.nextGate++;s.stage=Math.min(10,s.nextGate)}
 if(s.active&&s.nextGate===10&&p.id===JUMP_PADS.at(-1)!.id&&p.theme==='duck')s.finalDuck=true
 if(s.active&&p.theme==='mole')padContact(s,p).hitAt=s.time
}
function endRun(s:JumpState){
 s.phase=s.finalDuck&&inFinish(s.x,s.z)?'complete':'fall'
 if(s.phase==='complete')rewardStage(s,10)
 s.active=false
}
/** Fixed substeps and moving top-surface landing; coins are local preview values only. */
export function stepJump(s:JumpState,dt:number,input:{x:number;z:number;fast:boolean}){
 let remaining=Math.min(.12,Math.max(0,dt))
 while(remaining>1e-7){const h=Math.min(1/120,remaining);remaining-=h;s.time+=h
  advancePadContact(s,s.grounded?s.pad:null,h)
  const length=Math.hypot(input.x,input.z)||1,speed=input.fast?JUMP_RULES.run:JUMP_RULES.walk,dx=input.x/length*speed*h,dz=input.z/length*speed*h
  if(clearMotionSegment([s.x,s.z],[s.x+dx,s.z+dz],s.y,{water:true,air:true})){s.x+=dx;s.z+=dz}
  const water=inLake(s.x,s.z),floor=water?LAKE.y:heightAt(s.x,s.z)
  if(s.grounded){
   const pose=s.pad?jumpPadPose(s.pad,s):null,supported=s.pad?containsPad(s.pad,s.x,s.z)&&pose!.solid:Math.abs(s.y-floor)<=JUMP_RULES.step
   if(!supported){s.grounded=false;s.leftAt=s.time;s.pad=null}else s.y=pose?.height??floor
  }
  if(s.time<=s.queued&&(s.grounded||!s.jumped&&s.time-s.leftAt<JUMP_RULES.coyote)){s.vy=JUMP_RULES.speed;s.grounded=false;s.jumped=true;s.pad=null;s.queued=-1}
  if(!s.grounded){const before=s.y;s.vy=Math.max(-JUMP_RULES.terminal,s.vy-JUMP_RULES.gravity*h);s.y+=s.vy*h
   let top=floor,landed:JumpPad|null=null
   for(const p of [...JUMP_PADS,...JUMP_GATES]){
    if(!isJumpPadVisible(p,s.active))continue
    const pose=jumpPadPose(p,s),old=jumpPadPose(p,s,s.time-h)
    if(pose.solid&&before>=old.height-.02&&s.y<=pose.height+.02&&s.vy<=(pose.height-old.height)/h&&pose.height>top&&containsPad(p,s.x,s.z)){top=pose.height;landed=p}
   }
   if((landed||s.vy<=0)&&s.y<=top+.02){s.y=top;s.vy=0;s.grounded=true;s.jumped=false;s.pad=landed;if(landed)landPad(s,landed);else if(s.active)endRun(s)}
  }
  if(s.y<JUMP_FINISH.y&&water&&s.active)endRun(s)
 }
}
