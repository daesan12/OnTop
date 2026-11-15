import type { MovementIntent } from './movementInput'
// Normal-ground response selected after the local comparison; park collision rules remain unchanged.
export const PARK_MOTION = {
 walkSpeed:6, runSpeed:8, jumpSpeed:8, gravity:30,
 tickSeconds:.05, gravityPerTick:1.5, verticalDrag:.98, maxFallSpeed:78.4,
 groundDrag:.6*.91, airDrag:.91, sprintJumpBoost:0,
} as const
export class ParkMotion {
 private vx=0; private vz=0; private vy=0; private remaining=.05; private running=false
 reset(velocityY=0){this.vx=this.vz=0;this.vy=velocityY;this.remaining=.05;this.running=false}
 stopHorizontal(){this.vx=this.vz=0;this.running=false}
 advance(input:MovementIntent,seconds:number,grounded:boolean,jumpSpeed:number=PARK_MOTION.jumpSpeed){
  const settings=PARK_MOTION
  const dt=Math.max(0,Math.min(seconds,.1)), jump=input.jump&&grounded
  if(jump){this.vy=jumpSpeed;this.remaining=.05
   if(input.run){this.vx+=input.dx*settings.sprintJumpBoost;this.vz+=input.dz*settings.sprintJumpBoost}
  }
  const supported=grounded&&!jump, drag=supported?PARK_MOTION.groundDrag:PARK_MOTION.airDrag
  // Cut off a released sprint while retaining the normal walk's ground drag.
  if (supported && this.running && !input.dx && !input.dz) this.stopHorizontal()
  // Continuous horizontal response preserves the 20Hz drag time scale at any render rate.
  const rate=-Math.log(drag)*20, decay=Math.exp(-rate*dt)
  const speed=supported?(input.run?settings.runSpeed:settings.walkSpeed)
   :(.02*(input.run?1.3*settings.runSpeed/5.6121:settings.walkSpeed/4.317)*.98*20)/(1-PARK_MOTION.airDrag)
  const tx=input.dx*speed,tz=input.dz*speed
  const dx=tx*dt+(this.vx-tx)*(1-decay)/rate, dz=tz*dt+(this.vz-tz)*(1-decay)/rate
  this.vx=tx+(this.vx-tx)*decay;this.vz=tz+(this.vz-tz)*decay
  if(input.dx||input.dz)this.running=input.run
  if(Math.hypot(this.vx,this.vz)<.06&&!(input.dx||input.dz)){this.vx=this.vz=0;this.running=false}
  let dy=0
  if(supported){this.vy=0;this.remaining=.05;dy=-.02*dt}
  else {let left=dt
   while(left>1e-10){const piece=Math.min(left,this.remaining);dy+=this.vy*piece;left-=piece;this.remaining-=piece
    if(this.remaining<1e-10){this.vy=Math.max(-settings.maxFallSpeed,(this.vy-settings.gravity*PARK_MOTION.tickSeconds)*PARK_MOTION.verticalDrag);this.remaining=.05}
   }
  }
  return {x:dx,y:dy,z:dz,velocityY:this.vy}
 }
 contact(wanted:{x:number;y:number;z:number;velocityY:number},actual:{x:number;y:number;z:number},grounded:boolean,walls:readonly {x:number;z:number}[]){
  // A grounded upward slide/automatic step is traversable support, not a wall.
  const climbing=grounded&&wanted.velocityY<=0&&actual.y>0.0001
  if(!climbing)for(const normal of walls){
   const length2=normal.x*normal.x+normal.z*normal.z
   const into=this.vx*normal.x+this.vz*normal.z
   if(length2>.000001&&into<0){this.vx-=normal.x*into/length2;this.vz-=normal.z*into/length2}
  }
  if(grounded&&this.vy<0||wanted.y>0&&actual.y+.0001<wanted.y){this.vy=0;this.remaining=.05}
 }
 flags(){const moving=Math.hypot(this.vx,this.vz)>.12;return {moving,running:moving&&this.running}}
 velocityY(){return this.vy}
}
