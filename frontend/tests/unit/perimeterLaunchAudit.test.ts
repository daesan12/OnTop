import {expect,it} from 'vitest'
import {site,heightAt,insidePark} from '../../src/park-renewal/plan'
import {createJumpState,queueJump,stepJump} from '../../src/park-renewal/jump10Simulation'
import {createRide,stepRide} from '../../src/park-renewal/rideAuditPlan'
import {parkWalkSurface} from '../../src/park-renewal/surfaceHeight'
import {insideMovementBoundary} from '../../src/park-renewal/motionPlan'

for(const [id,offset]of[['tower',40],['pagoda',36],['balloon',6]]as const)it(`${id}: 정상에서 외곽을 향해 달리며 점프해도 직진·대각선 모두 돌담 안에 남는다`,()=>{
 const origin=site(id),angle=Math.atan2(origin.z,origin.x)
 for(const turn of[-Math.PI/9,0,Math.PI/9]){
  const direction={x:Math.cos(angle+turn),z:Math.sin(angle+turn),fast:true},s=createJumpState(),initialY=heightAt(origin.x,origin.z)+offset
  Object.assign(s,{x:origin.x,z:origin.z,y:initialY});queueJump(s)
  let peak=initialY,wallContacts=0,distance=0
  for(let i=0;i<1800;i++){const x=s.x,z=s.z;stepJump(s,1/60,direction);peak=Math.max(peak,s.y);distance+=Math.hypot(s.x-x,s.z-z);if(Math.hypot(s.x-x,s.z-z)<.001)wallContacts++;expect(insideMovementBoundary(s.x,s.z,s.y),JSON.stringify({id,turn,x:s.x,y:s.y,z:s.z})).toBe(true)}
  expect(peak-initialY).toBeGreaterThan(.8);expect(distance).toBeGreaterThan(3);expect(wallContacts).toBeGreaterThan(60)
  expect(insidePark(s.x+direction.x,s.z+direction.z,.65)).toBe(false)
 }
})

for(const travel of['bicycle','scooter']as const)for(const reverse of[false,true])it(`점프맵 뒤→열기구 ${travel} ${reverse?'하행':'상행'}: 중앙과 양쪽 1.2m 차선에서 울타리가 차체를 막지 않는다`,()=>{
 for(const lane of[-1.2,0,1.2]){
  const s=createRide('jump-balloon',travel,parkWalkSurface,reverse,lane)
  for(let i=0;i<20000&&!s.blocked&&!s.complete;i++)stepRide(s,1/60,parkWalkSurface)
  const detail=JSON.stringify({travel,reverse,lane,x:s.x,z:s.z})
  expect(s.blocked,detail).toBe(false);expect(s.complete,detail).toBe(true);expect(s.maxGrade,detail).toBeLessThan(Math.tan(14.5*Math.PI/180));expect(s.maxRoll,detail).toBeLessThan(Math.tan(13*Math.PI/180))
 }
},20000)
