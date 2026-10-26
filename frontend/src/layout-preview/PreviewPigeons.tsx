import { avatars } from '../network/worldClient'
import { ParkPigeons,type PigeonHabitat } from '../world/pigeons/ParkPigeons'
import { createBirds,type Point,type Visitor } from '../world/pigeons/pigeonSimulation'
import { canWalk,LIFE_PLAZA,walkHeight } from './layout'
import { swimmingAt } from './lakeLayout'
import { previewMotion } from './PreviewCamera'
import { trunks,shoreTrunks } from './sceneGeometry'

const trees=[...trunks,...shoreTrunks]
function safe(x:number,z:number) {
  return canWalk(x,z)&&!swimmingAt(x,z)&&walkHeight(x,z)<.4
    &&!trees.some(t=>Math.hypot(x-t.p[0],z-t.p[2])<.65)
}
function height(x:number,z:number) {
  return Math.max(walkHeight(x,z),Math.abs(x)<LIFE_PLAZA.width/2&&Math.abs(z-LIFE_PLAZA.z)<LIFE_PLAZA.depth/2?.14:.085)
}
function clear(a:Point,b:Point) {
  const steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.25))
  for(let i=0;i<=steps;i++)if(!safe(a.x+(b.x-a.x)*i/steps,a.z+(b.z-a.z)*i/steps))return false
  return true
}
const centers=[{x:0,z:38},{x:-56,z:-4},{x:41,z:70}]
export const PREVIEW_PIGEON_SITES=centers.map(c=>{
  const points:Point[]=[]
  for(let z=-8;z<=8;z+=2)for(let x=-8;x<=8;x+=2)if(safe(c.x+x,c.z+z))points.push({x:c.x+x,z:c.z+z})
  return points
})
const visitor:Visitor={x:0,y:0,z:0,vx:0,vz:0},visitors=[visitor],noVisitors:Visitor[]=[]
const habitat:PigeonHabitat={
  sites:PREVIEW_PIGEON_SITES,
  spawn:i=>createBirds(i,PREVIEW_PIGEON_SITES[i],centers[i],height),
  environment:{groundHeight:height,clearRoute:clear},
  visitors:()=>{
    if(previewMotion.mode!=='walk'||previewMotion.swimming)return noVisitors
    visitor.x=previewMotion.x;visitor.z=previewMotion.z;visitor.y=height(visitor.x,visitor.z)+.8
    visitor.vx=previewMotion.vx;visitor.vz=previewMotion.vz
    return visitors
  },
}
/** Original mesh, animation and behavior, with preview-only terrain/visitor inputs. */
const liveVisitors:Visitor[]=[]
const liveHabitat:PigeonHabitat={...habitat,visitors:()=>{
 liveVisitors.length=0
 for(const a of avatars.values())if(a.connected&&!a.swimming)liveVisitors.push({x:a.current.x,y:a.current.y,z:a.current.z,vx:(a.current.x-a.previous.x)/.12,vz:(a.current.z-a.previous.z)/.12})
 return liveVisitors
}}
export function PreviewPigeons({live=false}:{live?:boolean}={}){return <ParkPigeons quality="high" habitat={live?liveHabitat:habitat}/>}
