import {boundaryFrame} from './contextPlan.ts'
import {heightAt} from './plan.ts'
import {FLOOR_Y_OFFSET} from './groundPlan.ts'

const frame=boundaryFrame(Math.PI/2)
export const GATE={x:frame.x,z:frame.z,y:heightAt(frame.x,frame.z)+FLOOR_Y_OFFSET,yaw:Math.atan2(frame.nx,frame.nz),opening:5.2,passageHalfWidth:2.05} as const
const samples=Array.from({length:2401},(_,i)=>{const angle=Math.PI/2+i/2400*Math.PI*2,p=boundaryFrame(angle);return {angle,x:p.x,z:p.z,distance:0}})
for(let i=1;i<samples.length;i++)samples[i]!.distance=samples[i-1]!.distance+Math.hypot(samples[i]!.x-samples[i-1]!.x,samples[i]!.z-samples[i-1]!.z)
export const BOUNDARY_LENGTH=samples.at(-1)!.distance
export function boundaryAtDistance(distance:number){
 const d=Math.max(0,Math.min(BOUNDARY_LENGTH,distance));let low=0,high=samples.length-1
 while(high-low>1){const m=(low+high)>>1;if(samples[m]!.distance<d)low=m;else high=m}
 const a=samples[low]!,b=samples[high]!,t=(d-a.distance)/(b.distance-a.distance),angle=a.angle+(b.angle-a.angle)*t,p=boundaryFrame(angle)
 return {...p,y:heightAt(p.x,p.z)+FLOOR_Y_OFFSET,angle,distance:d}
}
const start=GATE.opening/2,end=BOUNDARY_LENGTH-GATE.opening/2,count=Math.ceil((end-start)/4)
export const WALL_RUNS=Array.from({length:count},(_,i)=>({start:start+(end-start)*i/count,end:start+(end-start)*(i+1)/count}))
export function gateLocalPoint(x:number,z:number){const dx=x-GATE.x,dz=z-GATE.z,c=Math.cos(GATE.yaw),s=Math.sin(GATE.yaw);return {x:dx*c-dz*s,z:dx*s+dz*c}}
export function inGatePassage(x:number,z:number){const p=gateLocalPoint(x,z);return Math.abs(p.x)<GATE.passageHalfWidth&&p.z>-8&&p.z<8}
