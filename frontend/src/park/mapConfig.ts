/** Active service placements. Asset-local geometry stays in config; gameplay reads this adapter. */
export * from '../config'
import * as base from '../config'
import { PARK_LAYOUT as p } from '../map/park'
import type { BoxCollider,Vec3 } from '../config/world'
export const TABLES=p.DRAFT_TABLES
export const BENCH_DEFINITIONS=p.data.interactions.benches
export const BENCHES=BENCH_DEFINITIONS.map(b=>b.position)
export const BENCH_YAWS=BENCH_DEFINITIONS.map(b=>b.yaw)
export const FITNESS_STATIONS=p.DRAFT_FITNESS_STATIONS
export const FITNESS_AREA=p.DRAFT_FITNESS_AREA
export const TELESCOPES=p.data.interactions.telescopes.map(t=>({...base.TELESCOPES.find(old=>old.id===t.id)!,position:t.position,yaw:t.yaw}))
export const MAILBOX={...base.MAILBOX,...p.SITES.mailbox}
export const NOTES_BOX={...base.NOTES_BOX,x:p.data.interactions.notes.position[0]!,y:p.data.interactions.notes.position[1]!,z:p.data.interactions.notes.position[2]!}
export const MINI_PROPS=[{...base.MINI_PROPS[0],...p.SITES.cart},{...base.MINI_PROPS[1],...p.SITES.vr}] as const
export const VR_ZONE=p.VR_COURT
export const FOUNTAIN={...base.FOUNTAIN,...p.SITES.fountain,plazaRadius:p.DRAFT_FOUNTAIN.plazaRadius}
export const GARDEN_PAGODA={...base.GARDEN_PAGODA,...p.SITES.pagoda}
export const OBSERVATION_TOWER={...base.OBSERVATION_TOWER,...p.SITES.tower}
export const LAKE={...base.LAKE,...p.SITES.lake,radiusX:p.SITES.lake.rx,radiusZ:p.SITES.lake.rz}
export const WORLD={...base.WORLD,halfSize:p.DRAFT_PARK.half}
export const PARK_SIZE=p.DRAFT_PARK.size
export const PARK_ENTRANCE={gateZ:p.MAIN_GATE.z,spawnZ:p.DRAFT_PARK.spawn[1],crossingZ:p.MAIN_GATE.z}
export const PARK_PAVILIONS=p.DRAFT_PAVILIONS
export const PARK_ROUTES=p.PATHS
export const isOnParkWalkway=(x:number,z:number)=>p.onPath(x,z)
export const isOnLakeCrossing=(x:number,z:number)=>p.lake.crossingHeight(x,z)!==undefined
export const PARK_ZONES=base.PARK_ZONES.map(z=>{
  const at=({'games-west':{x:TABLES[0]!.position[0],z:TABLES[0]!.position[2]},'games-east':{x:TABLES[1]!.position[0],z:TABLES[1]!.position[2]},central:p.DRAFT_PAVILIONS[0],lake:p.SITES.lake,tower:p.SITES.tower,fitness:p.SITES.fitness,mini:p.SITES.cart,vr:p.SITES.vr,fountain:p.SITES.fountain,mailbox:p.SITES.mailbox,pagoda:p.SITES.pagoda} as Record<string,{x:number;z:number}>)[z.id]
  return {...z,...at}
})
export const WORLD_COLLIDERS:readonly BoxCollider[]=p.data.physics.boxes.map(b=>({id:b.id,center:b.center,half:b.half,camera:b.role==='solid',movementHalf:b.half,movementYaw:b.yaw}))
export const LAMPS=p.DRAFT_LAMPS
export const BRIDGE={...base.BRIDGE,...p.lake.CROSSINGS.find(c=>c.kind==='wood')!}
export function lakeRadiusAt(x:number,z:number){return p.lake.lakeRadius(x,z)}
export const groundHeight=p.walkHeight
export function serviceWalkHeight(x:number,z:number) {
  let y=p.walkHeight(x,z)
  for(const b of p.data.physics.boxes)if(b.role==='surface'&&Math.abs(x-b.center[0])<=b.half[0]&&Math.abs(z-b.center[2])<=b.half[2])y=Math.max(y,b.center[1]+b.half[1])
  return y
}
export function telescopeLanding(t:typeof TELESCOPES[number],exit=false):Vec3 {
  const pose=p.data.interactions.telescopes.find(x=>x.id===t.id)![exit?'exit':'use']
  return [pose.x,pose.y,pose.z]
}
