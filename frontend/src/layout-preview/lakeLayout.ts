import { LAKE, SWIMMING } from '../config/parkLandforms'
import { LAKE_ROCKS } from '../config/lakeRocks'

export const DRAFT_LAKE={x:62,z:-14,rx:18,rz:43,surfaceY:LAKE.surfaceY}
export const shoreHalfSpan=(z:number)=>DRAFT_LAKE.rx*Math.sqrt(Math.max(0,1-((z-DRAFT_LAKE.z)/DRAFT_LAKE.rz)**2))
export const CROSSINGS=[
  {id:'layout-stone-bridge',kind:'stone',z:-26,startX:DRAFT_LAKE.x-shoreHalfSpan(-26)-.55,endX:DRAFT_LAKE.x+shoreHalfSpan(-26)+.55,halfWidth:1.4},
  {id:'layout-wood-bridge',kind:'wood',z:9,startX:DRAFT_LAKE.x-shoreHalfSpan(9)-.65,endX:DRAFT_LAKE.x+shoreHalfSpan(9)+.65,halfWidth:1.8},
] as const
const woodCrossing=CROSSINGS[1]
export const BRIDGE_LANDINGS=[{x0:woodCrossing.startX-2.3,x1:woodCrossing.startX,side:-1},{x0:woodCrossing.endX,x1:woodCrossing.endX+2.3,side:1}].map(p=>({...p,z:woodCrossing.z,halfWidth:2.4}))
export function landingHeight(x:number,z:number) {
  const p=BRIDGE_LANDINGS.find(p=>x>=p.x0&&x<=p.x1&&Math.abs(z-p.z)<=p.halfWidth)
  if(!p)return undefined
  const t=(x-p.x0)/(p.x1-p.x0);return .085+.035*(p.side<0?t:1-t)
}
export const lakeRadius=(x:number,z:number)=>Math.hypot((x-DRAFT_LAKE.x)/DRAFT_LAKE.rx,(z-DRAFT_LAKE.z)/DRAFT_LAKE.rz)
export function crossingAt(x:number,z:number) {
  return CROSSINGS.find(c=>x>=c.startX&&x<=c.endX&&Math.abs(z-c.z)<=c.halfWidth)
}
export function crossingHeight(x:number,z:number) {
  const c=crossingAt(x,z)
  if(!c)return landingHeight(x,z)
  return c.kind==='stone'?.32:.12+Math.sin(Math.PI*(x-c.startX)/(c.endX-c.startX))**2*1.85
}
export const FISHING_RAILS=[{x:49,w:8},{x:79,w:6}].flatMap(d=>[-1,1].map(sign=>({from:[d.x-d.w/2+.18,-43+sign*2.82] as const,to:[d.x+d.w/2-.18,-43+sign*2.82] as const})))
export const onFishingDeck=(x:number,z:number)=>(Math.abs(x-49)<4&&Math.abs(z+43)<3)||(Math.abs(x-79)<3&&Math.abs(z+43)<3)
export const FISHING_LANDINGS=[{x0:42,x1:45,y0:.085,y1:.32},{x0:82,x1:84,y0:.32,y1:.085}] as const
export function fishingHeight(x:number,z:number) {
  if(onFishingDeck(x,z))return .32
  const landing=FISHING_LANDINGS.find(p=>x>=p.x0&&x<=p.x1&&Math.abs(z+43)<=1.6)
  return landing?landing.y0+(landing.y1-landing.y0)*(x-landing.x0)/(landing.x1-landing.x0):undefined
}
export function lakeFloorHeight(x:number,z:number) {
  return -LAKE.depth*Math.max(0,Math.min(1,(1-lakeRadius(x,z))/.14))
}
export const swimmingAt=(x:number,z:number)=>crossingHeight(x,z)===undefined&&!onFishingDeck(x,z)&&lakeFloorHeight(x,z)<-SWIMMING.depthThreshold
// Openings for both crossings, fishing access and two broad, shallow swimming entries.
export function shoreAccess(_x:number,z:number) {
  return CROSSINGS.some(c=>Math.abs(z-c.z)<c.halfWidth+1.2)
    ||Math.abs(z+43)<4.5||Math.abs(z-DRAFT_LAKE.z)<3.8
}
export const SHORE_RUNS=Array.from({length:180},(_,i)=>{
  const at=(n:number)=>[DRAFT_LAKE.x+Math.cos(n*Math.PI/90)*(DRAFT_LAKE.rx+.55),DRAFT_LAKE.z+Math.sin(n*Math.PI/90)*(DRAFT_LAKE.rz+.55)] as const
  return {from:at(i),to:at(i+1)}
}).filter(r=>!shoreAccess((r.from[0]+r.to[0])/2,(r.from[1]+r.to[1])/2))

// Reuse the existing rock arrangement, normalized to the enlarged lake.
export const DRAFT_LAKE_ROCKS=LAKE_ROCKS.map((r,i)=>({
  id:`lake-boulder-${i}`,x:DRAFT_LAKE.x+(r.position[0]-LAKE.x)*DRAFT_LAKE.rx/LAKE.radiusX,
  y:r.position[1],z:DRAFT_LAKE.z+(r.position[2]-LAKE.z)*DRAFT_LAKE.rz/LAKE.radiusZ,
  size:r.size,yaw:r.yaw,
 })).map(r=>{
  // Keep the full rotated/noisy boulder footprint inside the rail, rather than only its centre.
  const bound=Math.hypot(r.size[0],r.size[2])*1.18,dx=r.x-DRAFT_LAKE.x,dz=r.z-DRAFT_LAKE.z
  let scale=1
  const safe=(k:number)=>Math.hypot(Math.abs(dx*k)/(DRAFT_LAKE.rx+.55-bound-.65),Math.abs(dz*k)/(DRAFT_LAKE.rz+.55-bound-.65))<=1
  if(!safe(1)){let lo=0,hi=1;for(let i=0;i<24;i++){const mid=(lo+hi)/2;if(safe(mid))lo=mid;else hi=mid}scale=lo}
  return {...r,x:DRAFT_LAKE.x+dx*scale,z:DRAFT_LAKE.z+dz*scale}
}).filter(r=>!CROSSINGS.some(c=>Math.abs(r.z-c.z)<c.halfWidth+2.2)
  &&!(Math.abs(r.z-DRAFT_LAKE.z)<4.4&&lakeRadius(r.x,r.z)>.78)&&!(Math.abs(r.z+43)<4.5&&lakeRadius(r.x,r.z)>.7))
export const SWIM_ENTRY_POINTS=[{x:42,z:-14},{x:82,z:-14}] as const
