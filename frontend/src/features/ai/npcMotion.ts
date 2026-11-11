export type NpcPose={x:number;y:number;z:number;yaw:number;warp?:number;seated?:boolean}
type Sample=NpcPose&{at:number}
/** Render between received snapshots instead of chasing each server tick and stopping in between. */
export class NpcMotion {
 private samples:Sample[]=[]
 push(p:NpcPose,at:number){
  const last=this.samples.at(-1)
  if(last&&at<=last.at)return
  const discontinuity=last&&((p.warp??0)!==(last.warp??0)||!!p.seated!==!!last.seated)
  if(discontinuity)this.samples=[]
  this.samples.push({...p,at});if(this.samples.length>24)this.samples.shift()
 }
 sample(now:number):NpcPose|null{
  const first=this.samples[0],last=this.samples.at(-1);if(!first||!last)return null
  const target=now-150
  if(target<=first.at)return first
  for(let i=1;i<this.samples.length;i++){
   const b=this.samples[i]!,a=this.samples[i-1]!
   if(target<=b.at){const t=Math.max(0,Math.min(1,(target-a.at)/(b.at-a.at)))
    const angle=Math.atan2(Math.sin(b.yaw-a.yaw),Math.cos(b.yaw-a.yaw))
    return {...b,x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t,yaw:a.yaw+angle*t}
   }
  }
  const previous=this.samples.at(-2)
  if(!previous)return last
  const t=Math.min(100,Math.max(0,target-last.at))/(last.at-previous.at),distance=Math.hypot(last.x-previous.x,last.y-previous.y,last.z-previous.z)
  const speed=distance/((last.at-previous.at)/1000)
  if(speed>10)return last
  return {...last,x:last.x+(last.x-previous.x)*t,y:last.y+(last.y-previous.y)*t,z:last.z+(last.z-previous.z)*t}
 }
}
