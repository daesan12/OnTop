import type { Visitor } from './pigeonSimulation'

interface Pose { x:number;y:number;z:number }
interface Sample extends Pose { at:number }
/** Compare displayed positions on the actual frame clock, not a guessed socket interval. */
export function createPigeonVisitorSampler() {
  const previous = new Map<string,Sample>()
  const sample=(id:string,pose:Pose,at:number,running:boolean,maxSpeed:number):Visitor => {
    const last=previous.get(id),seconds=last?(at-last.at)/1000:0
    previous.set(id,{...pose,at})
    const dx=last?pose.x-last.x:0,dz=last?pose.z-last.z:0,distance=Math.hypot(dx,dz)
    const speed=running&&seconds>0&&seconds<.25&&distance<3?Math.min(maxSpeed,distance/seconds):0
    return {...pose,vx:distance>0?dx/distance*speed:0,vz:distance>0?dz/distance*speed:0}
  }
  return Object.assign(sample,{retain(ids:ReadonlySet<string>){for(const id of previous.keys())if(!ids.has(id))previous.delete(id)}})
}
