// Offline only. Runtime reads the baked positions; no runtime contact solver is shipped.
import {readFileSync,writeFileSync} from 'node:fs'
import {MIX_START_MS,MIX_END_MS,MIX_DURATION_MS,CAPSULE_FLOOR,CAPSULE_RADIUS,smooth,jarRadius,outletPose} from '../gachaMixTiming.ts'
const source=readFileSync(new URL('../gachaMachineGeometry.ts',import.meta.url),'utf8')
const rest=JSON.parse(source.match(/export const PARK_CAPSULES:XYZ\[\]=(\[[^\n]+\])/)[1])
const D=.637,DT=1/240,pose=new Float32Array(4)
const clone=s=>s.map(b=>({...b}))
const start=rest.map(([x,y,z],i)=>({x,y,z,vx:0,vy:0,vz:0,i}))
function constrain(b){
 b.y=Math.max(CAPSULE_FLOOR+CAPSULE_RADIUS,Math.min(3.93,b.y))
 const max=jarRadius(b.y+.12)-.39,rad=Math.hypot(b.x,b.z)
 if(rad>max){b.x*=max/rad;b.z*=max/rad}
}
function step(state,time,winner=-1,origin=null){
 const energy=smooth((time-MIX_START_MS)/180)*(1-smooth((time-(MIX_END_MS-220))/220))
 const seeking=winner>=0?1-smooth((time-(MIX_END_MS+550))/450):0
 const old=state.map(b=>[b.x,b.y,b.z])
 for(const b of state){
  if(b.i===winner){outletPose(time,origin,pose);b.x=pose[0];b.y=pose[1];b.z=pose[2];continue}
  const target=rest[b.i],turn=2.6*energy
  b.vx+=(-b.z*turn-b.vx)*DT*2.5;b.vz+=(b.x*turn-b.vz)*DT*2.5
  b.vy-=4.2*DT
  if(seeking>0){b.vx+=(target[0]-b.x)*DT*48*seeking;b.vy+=(target[1]-b.y)*DT*48*seeking;b.vz+=(target[2]-b.z)*DT*48*seeking}
  const drag=Math.exp(-DT*(energy>0?.8:seeking>0?10:5))
  b.vx*=drag;b.vy*=drag;b.vz*=drag
  b.x+=b.vx*DT;b.y+=b.vy*DT;b.z+=b.vz*DT
 }
 for(let pass=0;pass<24;pass++){
  for(const b of state)if(b.i!==winner)constrain(b)
  for(let i=0;i<state.length;i++)for(let j=i+1;j<state.length;j++){
   const a=state[i],b=state[j],dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,dist=Math.max(.00001,Math.hypot(dx,dy,dz))
   const winning=a.i===winner||b.i===winner,winScale=winning?pose[3]:1
   if(winning&&(winScale<.02||pose[1]<CAPSULE_FLOOR))continue
   const required=winning?D*(1+winScale)/2:D
   if(dist<required){const correction=(required-dist)/dist,wa=a.i===winner?0:b.i===winner?1:.5,wb=b.i===winner?0:a.i===winner?1:.5;a.x-=dx*correction*wa;a.y-=dy*correction*wa;a.z-=dz*correction*wa;b.x+=dx*correction*wb;b.y+=dy*correction*wb;b.z+=dz*correction*wb}
  }
 }
 for(const b of state)if(b.i!==winner)constrain(b)
 for(let i=0;i<state.length;i++){
  const b=state[i];if(b.i===winner)continue
  b.vx=(b.x-old[i][0])/DT;b.vy=(b.y-old[i][1])/DT;b.vz=(b.z-old[i][2])/DT
  if(b.y<=CAPSULE_FLOOR+CAPSULE_RADIUS+.003){b.vy=Math.max(0,energy*(2.6+.45*Math.sin(b.i*2.4+time*.009)));b.vx*=.8;b.vz*=.8}
  const speed=Math.hypot(b.vx,b.vy,b.vz);if(speed>5){b.vx*=5/speed;b.vy*=5/speed;b.vz*=5/speed}
 }
}
const positions=s=>s.flatMap(b=>[b.x,b.y,b.z].map(v=>+v.toFixed(5)))
function bake(state,from,to,intervals,winner=-1,origin=null){
 const frames=[positions(state)];let clock=from
 for(let frame=1;frame<=intervals;frame++){
  const target=from+(to-from)*frame/intervals
  while(clock+DT*1000/2<target){
   clock+=DT*1000;step(state,clock,winner,origin)
   // Finish the small contact relaxation before the last displayed frame freezes.
   if(winner>=0&&clock>3100)for(let sub=0;sub<3;sub++)step(state,clock,winner,origin)
  }
  frames.push(positions(state))
 }
 return frames
}
const state=clone(start),mix=bake(state,0,MIX_END_MS,63),settle={}
for(const winner of [14,15,16,17]){
 const variant=clone(state),origin=[state[winner].x,state[winner].y,state[winner].z]
 settle[winner]=bake(variant,MIX_END_MS,MIX_DURATION_MS,47,winner,origin)
}
const data={version:1,seed:0,rest,mix,settle}
const serialized=JSON.stringify(data).replace(/\],\[/g,'],\n[')
writeFileSync(new URL('../capsuleMixClip.json',import.meta.url),serialized+'\n')
console.log(JSON.stringify({mixFrames:mix.length,settleFrames:Object.values(settle).map(f=>f.length),bytes:Buffer.byteLength(serialized)}))
