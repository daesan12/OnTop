export const MIX_START_MS=450
export const MIX_END_MS=2100
export const INTAKE_END_MS=2300
export const PIPE_END_MS=2500
export const EXIT_END_MS=2950
export const MIX_DURATION_MS=3650
export const CAPSULE_FLOOR=2.12
export const CAPSULE_RADIUS=.315
export const OUTLET_POSITION=[0,.84,1.56] as const
export type MixPhase='idle'|'turning'|'mixing'|'intake'|'pipe'|'exit'|'settling'|'complete'
export const smooth=(v:number)=>{const t=Math.max(0,Math.min(1,v));return t*t*(3-2*t)}
/** Cosmetic index only: the already-confirmed receipt supplies the grade. */
export const winningCapsule=(grade:number)=>grade===5?16:14+(grade+1)%4
export function mixPhase(t:number):MixPhase{
 if(t<0)return 'idle'
 if(t<MIX_START_MS)return 'turning'
 if(t<MIX_END_MS)return 'mixing'
 if(t<INTAKE_END_MS)return 'intake'
 if(t<PIPE_END_MS)return 'pipe'
 if(t<EXIT_END_MS)return 'exit'
 if(t<MIX_DURATION_MS)return 'settling'
 return 'complete'
}
/** Reuse the same instance: intake -> hidden chute -> open arch -> red tray. */
export function outletPose(t:number,origin:readonly number[],out:Float32Array|number[],offset=0){
 let x=origin[0]!,y=origin[1]!,z=origin[2]!,scale=1
 if(t>=MIX_END_MS&&t<INTAKE_END_MS){
  const u=smooth((t-MIX_END_MS)/(INTAKE_END_MS-MIX_END_MS));x*=1-u;y+=(2.46-y)*u;z+=(.25-z)*u;scale=1-u
 }else if(t>=INTAKE_END_MS&&t<PIPE_END_MS){x=0;y=.84;z=1;scale=0}
 else if(t>=PIPE_END_MS){
  const u=smooth((t-PIPE_END_MS)/(EXIT_END_MS-PIPE_END_MS));x=0;y=.84;z=1+.56*u;scale=smooth((t-PIPE_END_MS)/110)
  if(t>=EXIT_END_MS&&t<MIX_DURATION_MS){const v=(t-EXIT_END_MS)/(MIX_DURATION_MS-EXIT_END_MS);y+=Math.sin(v*Math.PI*3)**2*.055*(1-v)**2}
 }
 out[offset]=x;out[offset+1]=y;out[offset+2]=z;out[offset+3]=Math.max(0,scale)
}
export function jarRadius(y:number){
 const profile=[[1.35,2.06],[1.49,2.27],[1.63,2.69],[1.66,3.24],[1.61,3.76],[1.47,4.17],[1.35,4.42]]
 for(let i=1;i<profile.length;i++)if(y<=profile[i]![1]!){const a=profile[i-1]!,b=profile[i]!;return a[0]!+(b[0]!-a[0]!)*(y-a[1]!)/(b[1]!-a[1]!)}
 return 1.35
}
