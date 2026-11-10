import type {MappedAnchor} from './mapping/types'
import type {PhysicalBox} from '../map/park/physics'
import type {TableAnchor} from '../config/world'
import {furnitureMovementBoxes} from '../map/park/furnitureCollision'
import {localPoint} from './accessSurfaces'
import {MOVEMENT} from '../config'

/** Identical, uninflated solid bounds for local sweeps and the server export.
 * Floors and entrances remain separate from pillars/rails/furniture. */
export function renewalSolidBoxes(rows:readonly MappedAnchor[]):PhysicalBox[]{
 const boxes:PhysicalBox[]=[]
 const box=(id:string,x:number,y:number,z:number,hx:number,hy:number,hz:number,yaw=0)=>boxes.push({id,center:[x,y,z],half:[hx,hy,hz],yaw,role:'solid'})
 for(const p of rows.filter(r=>r.kind==='pavilion'&&r.status==='mapped')){
  const [x,,z]=p.position!,floor=p.floorY!,main=p.id==='P0',unit=main?1:p.scale[0],radius=(main?7.9:2.38)*unit,height=(main?6.57:2.68)*unit
  for(let i=0;i<8;i++){
   const angle=(i+.5)*Math.PI/4,[px,pz]=localPoint(Math.sin(angle)*radius,Math.cos(angle)*radius,x,z,p.yaw)
   box(p.id+'-pillar-'+i,px,floor+height/2,pz,(main?.3:.14)*unit,height/2,(main?.3:.14)*unit,p.yaw)
  }
  const railRadius=(main?9.4:2.38)*unit,railHeight=(main?1.295:.9)*unit
  for(let side=0;side<8;side++){
   if(!main&&side===7)continue
   const a=(side+.5)*Math.PI/4,b=a+Math.PI/4,start:readonly[number,number]=[Math.sin(a)*railRadius,Math.cos(a)*railRadius],end:readonly[number,number]=[Math.sin(b)*railRadius,Math.cos(b)*railRadius]
   const full=Math.hypot(end[0]-start[0],end[1]-start[1]),gap=main&&side%2===1?(side===3?4.374:2.974):0
   const spans=gap?[[0,(full-gap)/2/full],[(full+gap)/2/full,1]]:[[0,1]]
   for(const [i,[lo,hi]]of spans.entries()){
    const t=(lo!+hi!)/2,[px,pz]=localPoint(start[0]+(end[0]-start[0])*t,start[1]+(end[1]-start[1])*t,x,z,p.yaw)
    box(p.id+'-rail-'+side+'-'+i,px,floor+railHeight/2,pz,.08*unit,railHeight/2,full*(hi!-lo!)/2,p.yaw+Math.atan2(end[0]-start[0],end[1]-start[1]))
   }
  }
 }
 for(const r of rows.filter(r=>r.kind==='table'&&r.status==='mapped')){
  const anchor:TableAnchor={id:r.id,position:r.position!,assetId:r.assetId!,pavilionId:r.pavilionId,seatUse:r.seats!.map(s=>s.use),
   seatAnchors:r.seats!.map(s=>[s.use.x-r.position![0],s.use.y-r.position![1],s.use.z-r.position![2]]as const),spectatorRadius:r.radius??4}
  // The native sub-pavilion table is scaled with the whole asset, and its mapped
  // game origin sits above the floor. Keep that floor as the collider bottom.
  const unit=r.pavilionId&&r.pavilionId!=='P0'?rows.find(p=>p.kind==='pavilion'&&p.id===r.pavilionId)!.scale[0]:1
  const native=!!r.pavilionId
  for(const b of furnitureMovementBoxes(anchor)){
   const floor=r.floorY??r.position![1]
   if(native&&!b.id.endsWith('-top')&&!r.seats!.find(s=>b.id.endsWith('-chair-'+s.seatIndex))?.presented)continue
   if(native&&r.pavilionId!=='P0'&&b.id.endsWith('-top'))continue
   const seat=r.seats!.find(s=>b.id.endsWith('-chair-'+s.seatIndex))
   // Outdoor seats are the original long stone benches (2.1 x .52 m),
   // with .52 x .85 m side stools when a four-player table presents them.
   const half:PhysicalBox['half']=!native&&seat?(seat.seatIndex<2?[1.05,b.half[1],.26]:[.26,b.half[1],.425]):native&&b.id.endsWith('-top')?[2.05,b.half[1],2.05]:native&&r.pavilionId!=='P0'?[.28*unit,b.half[1],.28*unit]:b.half
   boxes.push({...b,center:[b.center[0],floor+b.half[1],b.center[2]],half,yaw:!native&&seat?0:native&&b.id.endsWith('-top')?r.yaw:b.yaw})
  }
 }
 return boxes
}

export function renewalRoundTables(rows:readonly MappedAnchor[]){
 return rows.filter(r=>r.kind==='table'&&r.status==='mapped'&&r.pavilionId&&r.pavilionId!=='P0').map(r=>({
  id:r.id+'-top',x:r.position![0],z:r.position![2],bottom:r.floorY!,top:r.floorY!+2.5,
  radius:.7*rows.find(p=>p.kind==='pavilion'&&p.id===r.pavilionId)!.scale[0],
 }))
}

export function blocksSolidPoint(boxes:readonly PhysicalBox[],x:number,z:number,foot:number,chairs?:ReadonlyMap<string,number>,radius=MOVEMENT.radius){
 return boxes.some(b=>{
  if(foot>=b.center[1]+b.half[1]-.02||foot+1.6<=b.center[1]-b.half[1]+.02)return false
  const dx=x-b.center[0],dz=z-b.center[2],c=Math.cos(b.yaw),s=Math.sin(b.yaw)
  const ox=Math.max(0,Math.abs(dx*c-dz*s)-b.half[0]),oz=Math.max(0,Math.abs(dx*s+dz*c)-b.half[2])
  if(ox*ox+oz*oz>=radius*radius)return false
  const chair=/^(.+)-chair-([0-3])$/.exec(b.id)
  return !chair||Number(chair[2])<(chairs?.get(chair[1]!)??2)
 })
}
