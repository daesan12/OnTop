import clip from './capsuleMixClip.json'
import {CAPSULE_RADIUS,EXIT_END_MS,MIX_DURATION_MS,MIX_END_MS,PIPE_END_MS,outletPose,smooth,winningCapsule} from './gachaMixTiming.ts'

const variants=clip.settle as Record<string,number[][]>
const origins=Array.from({length:18},(_,i)=>clip.mix[clip.mix.length-1]!.slice(i*3,i*3+3))
export const CAPSULE_POSE_STRIDE=7 // x,y,z,scale,rotationX,rotationY,rotationZ
/** Allocation-free sampling. Output is supplied by each renderer, never shared between scenes. */
export function sampleCapsuleMix(t:number,grade:number,out:Float32Array){
 const winner=winningCapsule(grade),frames=t<=MIX_END_MS?clip.mix:variants[winner]!
 const progress=t<=MIX_END_MS?Math.max(0,t)/MIX_END_MS:(Math.min(MIX_DURATION_MS,t)-MIX_END_MS)/(MIX_DURATION_MS-MIX_END_MS)
 const f=progress*(frames.length-1),lo=Math.min(frames.length-1,Math.floor(f)),hi=Math.min(frames.length-1,lo+1),u=f-lo
 const a=frames[lo]!,b=frames[hi]!,energy=smooth((t-450)/180)*(1-smooth((t-1900)/900))
 for(let i=0;i<18;i++){
  const k=i*CAPSULE_POSE_STRIDE,j=i*3
  for(let axis=0;axis<3;axis++)out[k+axis]=t<0?clip.rest[i]![axis]!:a[j+axis]!+(b[j+axis]!-a[j+axis]!)*u
  out[k+3]=1
  out[k+4]=Math.sin(i*1.7)*.42+Math.sin(t*.005+i)*.18*energy
  out[k+5]=i*.79+(t<0?0:Math.min(t,MIX_END_MS)*.002)*smooth((t-450)/300)
  out[k+6]=Math.cos(i*1.3)*.42+Math.cos(t*.004+i)*.18*energy
 }
 if(t>=MIX_END_MS){
  const k=winner*CAPSULE_POSE_STRIDE,origin=origins[winner]!
  outletPose(t,origin,out,k)
  if(t>=PIPE_END_MS){out[k+4]=.12;out[k+5]=-.3;out[k+6]=.09*(1-smooth((t-PIPE_END_MS)/(EXIT_END_MS-PIPE_END_MS)))}
 }
 return winner
}
/** Artwork has a taller wooden pedestal: keep its outlet aligned with the painted arch. */
export function projectCapsuleToPanel(t:number,index:number,winner:number,poses:Float32Array){
 const k=index*CAPSULE_POSE_STRIDE
 poses[k]*=59;poses[k+1]=(poses[k+1]!-2.12)*59-18.8;poses[k+2]=poses[k+2]!*59+15
 if(index===winner&&t>=PIPE_END_MS){
  const u=smooth((t-PIPE_END_MS)/(EXIT_END_MS-PIPE_END_MS))
  const bounce=t>=EXIT_END_MS&&t<MIX_DURATION_MS?Math.sin((t-EXIT_END_MS)/700*Math.PI*3)**2*.055*(1-(t-EXIT_END_MS)/700)**2:0
  poses[k]=0;poses[k+1]=281.25-(401+43*u)+bounce*59;poses[k+2]=45
 }
}
export const capsuleMotionScale=CAPSULE_RADIUS
