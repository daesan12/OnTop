import {ParkMotion} from '../../network/parkMotion'
import type {PredictionSimulation} from '../../network/localMovementPrediction'
import type {MovementIntent} from '../../network/movementInput'
import type {Pose} from '../../network/worldClient'
import {parkWalkSurface} from '../surfaceHeight'
import {canTravel} from '../travelMotion'
import {JUMP_SEQUENCE,containsPad} from '../jump10Plan'
import {jumpPadPose} from '../jumpGimmicks'
import {renewalJumpMotion,syncJumpMotion,visibleJumpPad,renewalPadAt} from './jumpMotion'
import {clearMotionSegment} from '../motionPlan'
import {useJumpmap} from '../../features/jumpmap/state'
/** Local display prediction only. Existing WORLD_POSITION validation remains server-owned. */
export class RenewalPrediction implements PredictionSimulation{
 private p:Pose={x:0,y:4.8,z:108,yaw:Math.PI};private motion=new ParkMotion();private grounded=true;private jumped=false;private moving=false;private running=false;private support=''
 reset(p:Pose,vy:number,grounded:boolean){this.p={...p};this.grounded=grounded;this.motion.reset(vy);syncJumpMotion();this.support=renewalPadAt({x:p.x,y:p.y-.8,z:p.z})?.id??''}
 setChairs(){} dispose(){} stopHorizontal(){this.motion.stopHorizontal();this.moving=this.running=false}
 pose(){return{...this.p}} movementFlags(){return{moving:this.moving,running:this.running}} groundedForLocomotion(){return this.grounded} stepSupported(){return this.grounded} stepJumped(){return this.jumped}
 step(input:MovementIntent,seconds:number){
  syncJumpMotion()
  const dt=Math.min(.05,Math.max(0,seconds)),from=this.p,foot=from.y-.8
  const enabled=useJumpmap.getState().available,prior=enabled?JUMP_SEQUENCE.find(p=>p.id===this.support):undefined
  if(prior&&(!visibleJumpPad(prior)||!jumpPadPose(prior,renewalJumpMotion).solid))this.grounded=false
  const wanted=this.motion.advance(input,dt,this.grounded),x=from.x+wanted.x,z=from.z+wanted.z
  this.jumped=!!input.jump&&this.grounded
  const airborneCourse=enabled&&!!useJumpmap.getState().run&&(!!prior||foot>parkWalkSurface(from.x,from.z)+2)
  const allowed=airborneCourse?clearMotionSegment([from.x,from.z],[x,z],foot,{water:true,air:true}):canTravel([from.x,from.z],[x,z],foot,'walk',Math.atan2(wanted.x,wanted.z)),nx=allowed?x:from.x,nz=allowed?z:from.z
  let floor=parkWalkSurface(nx,nz,foot),support=''
  if(enabled)for(const p of JUMP_SEQUENCE){
   if(!visibleJumpPad(p)||!containsPad(p,nx,nz))continue
   const pose=jumpPadPose(p,renewalJumpMotion),old=jumpPadPose(p,renewalJumpMotion,renewalJumpMotion.time-dt)
   const follows=this.grounded&&!this.jumped&&p.id===this.support
   if(pose.solid&&pose.height>floor&&(follows||wanted.velocityY<=0&&foot>=old.height-.08&&from.y+wanted.y-.8<=pose.height+.03)){floor=pose.height;support=p.id}
  }
  const rise=floor-foot,ny=from.y+wanted.y,snap=!this.jumped&&this.grounded&&(support===this.support&&!!support||rise<.4&&rise>-.5)
  this.grounded=snap||wanted.velocityY<=0&&ny<=floor+.8
  this.p={x:nx,y:this.grounded?floor+.8:ny,z:nz,yaw:input.dx||input.dz?Math.atan2(input.dx,input.dz):from.yaw}
  this.support=this.grounded?support:''
  const actual={x:nx-from.x,y:this.p.y-from.y,z:nz-from.z};this.motion.contact(wanted,actual,this.grounded,allowed?[]:[{x:-wanted.x,z:-wanted.z}])
  this.moving=Math.hypot(actual.x,actual.z)>.0001;this.running=this.moving&&input.run
 }
}
