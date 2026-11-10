import mapping from '../../../generated/park-renewal/mapping.json' with {type:'json'}
import type {MappedAnchor} from '../mapping/types'
import type {TableAnchor,Vec3} from '../../config/world'
import {RENEWAL_PARK_ENABLED} from '../../park/mapSelection'

export const renewalMapping=mapping
export const renewalAnchors=mapping.coordinates as unknown as MappedAnchor[]
export const renewalAnchor=(kind:string,id:string)=>RENEWAL_PARK_ENABLED?renewalAnchors.find(r=>r.kind===kind&&r.id===id&&r.status!=='unplaced'):undefined
export const renewalTables:readonly TableAnchor[]=renewalAnchors.filter(r=>r.kind==='table'&&r.status==='mapped').map(r=>({
 id:r.id,position:r.position!,assetId:r.assetId!,pavilionId:r.pavilionId,seatAnchors:r.seats!.map(s=>[s.use.x-r.position![0],s.use.y-r.position![1],s.use.z-r.position![2]]as Vec3),
 seatUse:r.seats!.map(s=>s.use),seatExits:r.seats!.map(s=>s.exit),floorY:r.floorY,spectatorRadius:r.radius??4,
}))
export const renewalBenches=renewalAnchors.filter(r=>r.kind==='bench'&&r.status==='mapped').map(r=>({id:r.id,position:r.position!,yaw:r.yaw,radius:r.radius??3,heightTolerance:r.heightTolerance??.7,seats:r.seats!.map(s=>s.use),exit:r.seats![0]!.exit}))
export function renewalInReach(kind:string,id:string,p:{x:number;y:number;z:number}|undefined){
 const r=renewalAnchor(kind,id);if(!r||!p||!r.position)return false
 const reach=r.reach??{x:r.position[0],y:(r.floorY??r.position[1])+.8,z:r.position[2]}
 return [p.x,p.y,p.z].every(Number.isFinite)&&Math.hypot(p.x-reach.x,p.z-reach.z)<=(r.radius??3)&&Math.abs(p.y-reach.y)<=(r.heightTolerance??.9)
}
export const renewalConstruction=mapping.world.constructionSites
