import { LAKE } from '../../config/parkLandforms'
import type { ParkDefinition } from './definition'
import { LAKE_ROCKS } from '../../config/lakeRocks'

export function resolveLake(definition:ParkDefinition['lake']) {
const DRAFT_LAKE={x:definition.x,z:definition.z,rx:definition.rx,rz:definition.rz,surfaceY:definition.surfaceY}
const shoreHalfSpan=(z:number)=>DRAFT_LAKE.rx*Math.sqrt(Math.max(0,1-((z-DRAFT_LAKE.z)/DRAFT_LAKE.rz)**2))
const CROSSINGS=definition.crossings.map(c=>({id:c.id,kind:c.kind,z:DRAFT_LAKE.z+c.offsetZ,startX:DRAFT_LAKE.x-shoreHalfSpan(DRAFT_LAKE.z+c.offsetZ)-c.shoreOverlap,endX:DRAFT_LAKE.x+shoreHalfSpan(DRAFT_LAKE.z+c.offsetZ)+c.shoreOverlap,halfWidth:c.halfWidth}))
const FISHING_DECKS=definition.decks.map(d=>({...d,x:DRAFT_LAKE.x+d.offsetX,z:DRAFT_LAKE.z+d.offsetZ}))
const woodCrossing=CROSSINGS.find(c=>c.kind==='wood')!
const BRIDGE_LANDINGS=[{x0:woodCrossing.startX-2.3,x1:woodCrossing.startX,side:-1},{x0:woodCrossing.endX,x1:woodCrossing.endX+2.3,side:1}].map(p=>({...p,z:woodCrossing.z,halfWidth:2.4}))
function landingHeight(x:number,z:number) {
  const p=BRIDGE_LANDINGS.find(p=>x>=p.x0&&x<=p.x1&&Math.abs(z-p.z)<=p.halfWidth)
  if(!p)return undefined
  const t=(x-p.x0)/(p.x1-p.x0);return .085+.035*(p.side<0?t:1-t)
}
const lakeRadius=(x:number,z:number)=>Math.hypot((x-DRAFT_LAKE.x)/DRAFT_LAKE.rx,(z-DRAFT_LAKE.z)/DRAFT_LAKE.rz)
function crossingAt(x:number,z:number) {
  return CROSSINGS.find(c=>x>=c.startX&&x<=c.endX&&Math.abs(z-c.z)<=c.halfWidth)
}
function crossingHeight(x:number,z:number) {
  const c=crossingAt(x,z)
  if(!c)return landingHeight(x,z)
  return c.kind==='stone'?.32:.12+Math.sin(Math.PI*(x-c.startX)/(c.endX-c.startX))**2*1.85
}
const FISHING_RAILS=FISHING_DECKS.flatMap(d=>[-1,1].map(sign=>({from:[d.x-d.w/2+.18,d.z+sign*(d.d/2-.18)] as const,to:[d.x+d.w/2-.18,d.z+sign*(d.d/2-.18)] as const})))
const onFishingDeck=(x:number,z:number)=>FISHING_DECKS.some(d=>Math.abs(x-d.x)<d.w/2&&Math.abs(z-d.z)<d.d/2)
const FISHING_LANDINGS=definition.landingOffsets.map(p=>({...p,x0:p.x0+DRAFT_LAKE.x,x1:p.x1+DRAFT_LAKE.x,z:FISHING_DECKS[0]!.z}))
function fishingHeight(x:number,z:number) {
  if(onFishingDeck(x,z))return .32
  const landing=FISHING_LANDINGS.find(p=>x>=p.x0&&x<=p.x1&&Math.abs(z-p.z)<=1.6)
  return landing?landing.y0+(landing.y1-landing.y0)*(x-landing.x0)/(landing.x1-landing.x0):undefined
}
function lakeFloorHeight(x:number,z:number) {
  return -definition.depth*Math.max(0,Math.min(1,(1-lakeRadius(x,z))/.14))
}
const swimmingAt=(x:number,z:number)=>crossingHeight(x,z)===undefined&&!onFishingDeck(x,z)&&lakeFloorHeight(x,z)<-definition.swimmingThreshold
// Openings for both crossings, fishing access and two broad, shallow swimming entries.
function shoreAccess(_x:number,z:number) {
  return CROSSINGS.some(c=>Math.abs(z-c.z)<c.halfWidth+1.2)
    ||Math.abs(z-FISHING_DECKS[0]!.z)<4.5||Math.abs(z-DRAFT_LAKE.z)<3.8
}
const SHORE_RUNS=Array.from({length:180},(_,i)=>{
  const at=(n:number)=>[DRAFT_LAKE.x+Math.cos(n*Math.PI/90)*(DRAFT_LAKE.rx+.55),DRAFT_LAKE.z+Math.sin(n*Math.PI/90)*(DRAFT_LAKE.rz+.55)] as const
  return {from:at(i),to:at(i+1)}
}).filter(r=>!shoreAccess((r.from[0]+r.to[0])/2,(r.from[1]+r.to[1])/2))

// Reuse the existing rock arrangement, normalized to the enlarged lake.
const DRAFT_LAKE_ROCKS=LAKE_ROCKS.map((r,i)=>({
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
  &&!(Math.abs(r.z-DRAFT_LAKE.z)<4.4&&lakeRadius(r.x,r.z)>.78)&&!(Math.abs(r.z-FISHING_DECKS[0]!.z)<4.5&&lakeRadius(r.x,r.z)>.7))
const SWIM_ENTRY_POINTS=definition.swimEntryOffsets.map(x=>({x:DRAFT_LAKE.x+x,z:DRAFT_LAKE.z}))

return {DRAFT_LAKE,CROSSINGS,FISHING_DECKS,BRIDGE_LANDINGS,landingHeight,shoreHalfSpan,lakeRadius,crossingAt,crossingHeight,FISHING_RAILS,onFishingDeck,FISHING_LANDINGS,fishingHeight,lakeFloorHeight,swimmingAt,shoreAccess,SHORE_RUNS,DRAFT_LAKE_ROCKS,SWIM_ENTRY_POINTS}
}
