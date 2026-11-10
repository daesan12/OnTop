/** Gameplay placements for the selected map. Model-local geometry keeps using config. */
export * from '../config'
import * as base from '../config'
import { EXPECTED_MAP_VERSION as LEGACY_MAP_VERSION } from '../config/mapVersion'
import { PARK_LAYOUT as p } from '../map/park'
import { buildInteractionData } from '../map/park/interactionData'
import { PARK_MAP_VERSION } from '../map/park/generated/mapVersion'
import { GENERATED_PARK_ENABLED as generated } from './mapSelection'
import { RENEWAL_PARK_ENABLED as renewal } from './mapSelection'
import {renewalTables,renewalBenches,renewalMapping,renewalAnchor,renewalAnchors} from '../park-renewal/runtime/placements'
import type { BoxCollider, Vec3 } from '../config/world'
import {heightAt as renewalGround,onRoad as renewalRoad} from '../park-renewal/plan'
import {parkWalkSurface} from '../park-renewal/surfaceHeight'

// Display policy belongs to the runtime, not the hashed shared-map source.
// Do not make a nickname-only change require a synchronized FE/BE map rollout.
export const OVERHEAD = {
  maxDistance: 50,
  telescopeMaxDistance: base.OVERHEAD.telescopeMaxDistance,
  headOffset: base.OVERHEAD.headOffset,
  bubbleDurationMs: base.OVERHEAD.bubbleDurationMs,
} as const

export const EXPECTED_MAP_VERSION: string = renewal ? renewalMapping.mappingVersion : generated ? PARK_MAP_VERSION : LEGACY_MAP_VERSION
export const TABLES = renewal ? renewalTables : generated ? p.DRAFT_TABLES : base.TABLES
export const BENCHES = renewal ? renewalBenches.map(b=>b.position) : generated ? p.data.interactions.benches.map(b => b.position) : base.BENCHES
export const BENCH_IDS = renewal ? renewalBenches.map(b=>b.id) : generated ? p.data.interactions.benches.map(b => b.id) : base.BENCHES.map((_, n) => 'bench-' + n)
export const BENCH_YAWS = renewal ? renewalBenches.map(b=>b.yaw) : generated ? p.data.interactions.benches.map(b => b.yaw) : base.BENCH_YAWS
/** Seat contact uses the same per-bench heights as the selected map's geometry and physics. */
const generatedBenchSites = generated ? buildInteractionData({ definition: p.SETTINGS,
  pavilions: p.DRAFT_PAVILIONS, towerBenches: p.DRAFT_TOWER_BENCHES, plazaBenches: p.PLAZA_BENCHES,
  restBenches: p.PLAZA_REST_BENCHES, fitness: p.DRAFT_FITNESS_STATIONS, decks: p.lake.FISHING_DECKS }).benchSites : []
// Explicit renewal poses may already include the raised furniture contact.
// Compensate the avatar's -.8 offset once, using the measured seat surface.
export const BENCH_SEAT_HEIGHTS: ReadonlyMap<string, number> = renewal ? new Map(renewalAnchors.filter(r=>r.kind==='bench'&&r.status==='mapped').map(r=>[r.id,r.seats![0]!.contactY-r.seats![0]!.use.y+.8])) : generated ? new Map(generatedBenchSites.map(b => [b.id, b.seatHeight]))
  : new Map(base.BENCHES.map((_, i) => [`bench-${i}`, base.BENCH_PAVILIONS[i] ? 0.56 : 0.58]))
export const FITNESS_STATIONS = renewal ? p.DRAFT_FITNESS_STATIONS.map(f=>{const r=renewalAnchor('fitness',f.id);return r?{...f,position:r.position!,yaw:r.yaw}:f}) : generated ? p.DRAFT_FITNESS_STATIONS : base.FITNESS_STATIONS
// Diagonal stations need enough clearance to step outside their effective footprint.
export const FITNESS = generated ? {...base.FITNESS,exitOffset:p.SETTINGS.fitness.exitOffset} : base.FITNESS
export const FITNESS_AREA = generated ? p.DRAFT_FITNESS_AREA : base.FITNESS_AREA
export const TELESCOPES = renewal ? base.TELESCOPES.map(t=>{const r=renewalAnchor('telescope',t.id)!;return {...t,position:r.position!,yaw:r.yaw}}) : generated ? p.data.interactions.telescopes.map(t => ({...base.TELESCOPES.find(old => old.id === t.id)!, position:t.position, yaw:t.yaw})) : base.TELESCOPES
const mail=renewalAnchor('interaction','feedback-mailbox'),notes=renewalAnchor('notes',p.data.interactions.notes.id)
export const MAILBOX = renewal ? {...base.MAILBOX,x:mail!.position![0],z:mail!.position![2],yaw:mail!.yaw} : generated ? {...base.MAILBOX,...p.SITES.mailbox,yaw:p.SETTINGS.mailbox.yaw,height:base.MAILBOX.height*p.SETTINGS.mailbox.scale,bodyHalfWidth:base.MAILBOX.bodyHalfWidth*p.SETTINGS.mailbox.scale,bodyHalfDepth:base.MAILBOX.bodyHalfDepth*p.SETTINGS.mailbox.scale} : base.MAILBOX
export const NOTES_BOX = renewal ? {...base.NOTES_BOX,x:notes!.position![0],y:notes!.position![1],z:notes!.position![2]} : generated ? {...base.NOTES_BOX,x:p.data.interactions.notes.position[0],y:p.data.interactions.notes.position[1],z:p.data.interactions.notes.position[2]} : base.NOTES_BOX
export const MINI_PROPS = renewal ? base.MINI_PROPS.map((v,i)=>{const r=renewalAnchor('game-entry',i===0?'fish-bread':'vr-experience-hall')!;return{...v,x:r.position![0],z:r.position![2],yaw:r.yaw}}) as unknown as typeof base.MINI_PROPS : generated ? [{...base.MINI_PROPS[0],...p.SITES.cart,...p.SETTINGS.fishBreadShop},{...base.MINI_PROPS[1],...p.SITES.vr}] as const : base.MINI_PROPS
export const VR_ZONE = generated ? p.VR_COURT : base.VR_ZONE
export const FOUNTAIN = generated ? {...base.FOUNTAIN,...p.SITES.fountain,plazaRadius:p.DRAFT_FOUNTAIN.plazaRadius} : base.FOUNTAIN
export const GARDEN_PAGODA = generated ? {...base.GARDEN_PAGODA,...p.SITES.pagoda} : base.GARDEN_PAGODA
export const OBSERVATION_TOWER = generated ? {...base.OBSERVATION_TOWER,...p.data.physics.tower} : base.OBSERVATION_TOWER
export const LAKE = generated ? {...base.LAKE,...p.SITES.lake,radiusX:p.SITES.lake.rx,radiusZ:p.SITES.lake.rz} : base.LAKE
export const WORLD = renewal ? {...base.WORLD,halfSize:110} : generated ? {...base.WORLD,halfSize:p.DRAFT_PARK.half} : base.WORLD
export const PARK_SIZE = renewal ? 220 : generated ? p.DRAFT_PARK.size : base.PARK_SIZE
export const PARK_ENTRANCE = generated ? {gateZ:p.MAIN_GATE.z,spawnZ:p.DRAFT_PARK.spawn[1],crossingZ:p.MAIN_GATE.z} : base.PARK_ENTRANCE
export const PARK_PAVILIONS = renewal ? renewalAnchors.filter(r=>r.kind==='pavilion'&&r.position).map(r=>({...base.PARK_PAVILIONS[0]!,id:r.id,x:r.position![0],z:r.position![2],floor:r.floorY??r.position![1]})) : generated ? p.DRAFT_PAVILIONS : base.PARK_PAVILIONS
export const PARK_ROUTES = generated ? p.PATHS : base.PARK_ROUTES
export const LAMPS = generated ? p.DRAFT_LAMPS : base.LAMPS
export const BRIDGE = generated ? {...base.BRIDGE,...p.lake.CROSSINGS.find(c => c.kind === 'wood')!} : base.BRIDGE
export const isOnParkWalkway = renewal ? renewalRoad : generated ? p.onPath : base.isOnParkWalkway
export const isOnLakeCrossing = (x:number,z:number) => generated ? p.lake.crossingHeight(x,z) !== undefined : Math.abs(z - base.BRIDGE.z) < base.BRIDGE.halfWidth && x >= base.BRIDGE.startX && x <= base.BRIDGE.endX
export const lakeRadiusAt = generated ? p.lake.lakeRadius : base.lakeRadiusAt
export const groundHeight = renewal ? renewalGround : generated ? p.walkHeight : base.groundHeight
export const PARK_ZONES = generated ? base.PARK_ZONES.map(zone => {
  const at = ({central:p.DRAFT_PAVILIONS[0],'games-west':{x:TABLES[0]!.position[0],z:TABLES[0]!.position[2]},'games-east':{x:TABLES[1]!.position[0],z:TABLES[1]!.position[2]},lake:p.SITES.lake,tower:p.SITES.tower,fitness:p.SITES.fitness,mini:p.SITES.cart,vr:p.SITES.vr,fountain:p.SITES.fountain,mailbox:p.SITES.mailbox,pagoda:p.SITES.pagoda} as Record<string,{x:number;z:number}>)[zone.id]
  return {...zone,...at}
}) : base.PARK_ZONES
export const WORLD_COLLIDERS:readonly BoxCollider[] = renewal ? [] : generated ? p.data.physics.boxes.map(b => ({id:b.id,center:b.center,half:b.half,camera:b.role==='solid',movementHalf:b.half,movementYaw:b.yaw})) : base.WORLD_COLLIDERS
const surfaces = p.data.physics.boxes.filter(b => b.role === 'surface')
export function serviceWalkHeight(x:number,z:number) {
  if(renewal)return parkWalkSurface(x,z)
  let height=groundHeight(x,z)
  if(generated) for(const b of surfaces) {
    const dx=x-b.center[0],dz=z-b.center[2],c=Math.cos(b.yaw),s=Math.sin(b.yaw)
    if(Math.abs(dx*c-dz*s)<=b.half[0]&&Math.abs(dx*s+dz*c)<=b.half[2])height=Math.max(height,b.center[1]+b.half[1])
  }
  return height
}
export function telescopeLanding(t:typeof TELESCOPES[number],exit=false):Vec3 {
  if(renewal){const r=renewalAnchor('telescope',t.id)!,v=r[exit?'exit':'use']!;return[v.x,v.y,v.z]}
  if(!generated)return base.telescopeLanding(t,exit)
  const pose=p.data.interactions.telescopes.find(x=>x.id===t.id)![exit?'exit':'use']
  return [pose.x,pose.y,pose.z]
}
