/** Gameplay placements for the selected map. Model-local geometry keeps using config. */
export * from '../config'
import * as base from '../config'
import { EXPECTED_MAP_VERSION as LEGACY_MAP_VERSION } from '../config/mapVersion'
import { PARK_LAYOUT as p } from '../map/park'
import { buildInteractionData } from '../map/park/interactionData'
import { PARK_MAP_VERSION } from '../map/park/generated/mapVersion'
import { GENERATED_PARK_ENABLED as generated } from './mapSelection'
import { renewalGroundHeight, renewalMap } from './renewalMap'
import type { BoxCollider, Vec3 } from '../config/world'

// Display policy belongs to the runtime, not the hashed shared-map source.
// Do not make a nickname-only change require a synchronized FE/BE map rollout.
export const OVERHEAD = {
  maxDistance: 50,
  telescopeMaxDistance: base.OVERHEAD.telescopeMaxDistance,
  headOffset: base.OVERHEAD.headOffset,
  bubbleDurationMs: base.OVERHEAD.bubbleDurationMs,
} as const

const renewal = renewalMap?.data
export const EXPECTED_MAP_VERSION: string = renewalMap?.mapVersion ?? (generated ? PARK_MAP_VERSION : LEGACY_MAP_VERSION)
export const TABLES: readonly base.TableAnchor[] = renewal?.tables.map(t => ({ ...t, spectatorRadius: 3.5 }))
  ?? (generated ? p.DRAFT_TABLES : base.TABLES)
const sharedBenches = renewal?.interactions.benches ?? (generated ? p.data.interactions.benches : null)
export const BENCHES = sharedBenches?.map(b => b.position) ?? base.BENCHES
export const BENCH_IDS = sharedBenches?.map(b => b.id) ?? base.BENCHES.map((_, n) => 'bench-' + n)
export const BENCH_YAWS = sharedBenches?.map(b => b.yaw) ?? base.BENCH_YAWS
/** Seat contact uses the same per-bench heights as the selected map's geometry and physics. */
const generatedBenchSites = generated ? buildInteractionData({ definition: p.SETTINGS,
  pavilions: p.DRAFT_PAVILIONS, towerBenches: p.DRAFT_TOWER_BENCHES, plazaBenches: p.PLAZA_BENCHES,
  restBenches: p.PLAZA_REST_BENCHES, fitness: p.DRAFT_FITNESS_STATIONS, decks: p.lake.FISHING_DECKS }).benchSites : []
export const BENCH_SEAT_HEIGHTS: ReadonlyMap<string, number> = renewal ? new Map(renewal.interactions.benches.map(b => [b.id, .56]))
  : generated ? new Map(generatedBenchSites.map(b => [b.id, b.seatHeight]))
  : new Map(base.BENCHES.map((_, i) => [`bench-${i}`, base.BENCH_PAVILIONS[i] ? 0.56 : 0.58]))
export const FITNESS_STATIONS = renewal ? p.DRAFT_FITNESS_STATIONS.flatMap(s => {
  const at = renewal.interactions.fitness.find(f => f.id === s.id)
  return at ? [{ ...s, position: at.position, yaw: at.yaw }] : []
}) : generated ? p.DRAFT_FITNESS_STATIONS : base.FITNESS_STATIONS
// Diagonal stations need enough clearance to step outside their effective footprint.
export const FITNESS = generated ? {...base.FITNESS,exitOffset:p.SETTINGS.fitness.exitOffset} : base.FITNESS
export const FITNESS_AREA = generated ? p.DRAFT_FITNESS_AREA : base.FITNESS_AREA
const sharedInteractions = renewal?.interactions ?? (generated ? p.data.interactions : null)
export const TELESCOPES = sharedInteractions ? sharedInteractions.telescopes.map(t => ({...base.TELESCOPES.find(old => old.id === t.id)!, position:t.position, yaw:t.yaw})) : base.TELESCOPES
export const MAILBOX = renewal ? { ...base.MAILBOX, x: renewal.interactions.mailbox.position[0], z: renewal.interactions.mailbox.position[2] }
  : generated ? {...base.MAILBOX,...p.SITES.mailbox,yaw:p.SETTINGS.mailbox.yaw,height:base.MAILBOX.height*p.SETTINGS.mailbox.scale,bodyHalfWidth:base.MAILBOX.bodyHalfWidth*p.SETTINGS.mailbox.scale,bodyHalfDepth:base.MAILBOX.bodyHalfDepth*p.SETTINGS.mailbox.scale} : base.MAILBOX
export const NOTES_BOX = sharedInteractions ? {...base.NOTES_BOX,x:sharedInteractions.notes.position[0],y:sharedInteractions.notes.position[1],z:sharedInteractions.notes.position[2]} : base.NOTES_BOX
export const MINI_PROPS = generated ? [{...base.MINI_PROPS[0],...p.SITES.cart,...p.SETTINGS.fishBreadShop},{...base.MINI_PROPS[1],...p.SITES.vr}] as const : base.MINI_PROPS
export const VR_ZONE = generated ? p.VR_COURT : base.VR_ZONE
export const FOUNTAIN = generated ? {...base.FOUNTAIN,...p.SITES.fountain,plazaRadius:p.DRAFT_FOUNTAIN.plazaRadius} : base.FOUNTAIN
export const GARDEN_PAGODA = generated ? {...base.GARDEN_PAGODA,...p.SITES.pagoda} : base.GARDEN_PAGODA
export const OBSERVATION_TOWER = renewal ? { ...base.OBSERVATION_TOWER, ...renewal.physics.tower }
  : generated ? {...base.OBSERVATION_TOWER,...p.data.physics.tower} : base.OBSERVATION_TOWER
export const LAKE = renewal ? { ...base.LAKE, ...renewal.surfaces.lake,
  radiusX: renewal.surfaces.lake.rx, radiusZ: renewal.surfaces.lake.rz }
  : generated ? {...base.LAKE,...p.SITES.lake,radiusX:p.SITES.lake.rx,radiusZ:p.SITES.lake.rz} : base.LAKE
export const WORLD = renewal ? { ...base.WORLD, halfSize: renewal.world.half }
  : generated ? {...base.WORLD,halfSize:p.DRAFT_PARK.half} : base.WORLD
export const PARK_SIZE = renewal?.world.size ?? (generated ? p.DRAFT_PARK.size : base.PARK_SIZE)
export const PARK_ENTRANCE = generated ? {gateZ:p.MAIN_GATE.z,spawnZ:p.DRAFT_PARK.spawn[1],crossingZ:p.MAIN_GATE.z} : base.PARK_ENTRANCE
export const PARK_PAVILIONS = renewal?.pavilions ?? (generated ? p.DRAFT_PAVILIONS : base.PARK_PAVILIONS)
export const PARK_ROUTES = generated ? p.PATHS : base.PARK_ROUTES
export const LAMPS = generated ? p.DRAFT_LAMPS : base.LAMPS
export const BRIDGE = generated ? {...base.BRIDGE,...p.lake.CROSSINGS.find(c => c.kind === 'wood')!} : base.BRIDGE
export const isOnParkWalkway = generated ? p.onPath : base.isOnParkWalkway
export const isOnLakeCrossing = (x:number,z:number) => generated ? p.lake.crossingHeight(x,z) !== undefined : Math.abs(z - base.BRIDGE.z) < base.BRIDGE.halfWidth && x >= base.BRIDGE.startX && x <= base.BRIDGE.endX
export const lakeRadiusAt = renewal ? (x: number, z: number) => Math.hypot((x - LAKE.x) / LAKE.radiusX, (z - LAKE.z) / LAKE.radiusZ)
  : generated ? p.lake.lakeRadius : base.lakeRadiusAt
export const groundHeight = renewal ? renewalGroundHeight : generated ? p.walkHeight : base.groundHeight
export const PARK_ZONES = generated ? base.PARK_ZONES.map(zone => {
  const at = ({central:p.DRAFT_PAVILIONS[0],'games-west':{x:TABLES[0]!.position[0],z:TABLES[0]!.position[2]},'games-east':{x:TABLES[1]!.position[0],z:TABLES[1]!.position[2]},lake:p.SITES.lake,tower:p.SITES.tower,fitness:p.SITES.fitness,mini:p.SITES.cart,vr:p.SITES.vr,fountain:p.SITES.fountain,mailbox:p.SITES.mailbox,pagoda:p.SITES.pagoda} as Record<string,{x:number;z:number}>)[zone.id]
  return {...zone,...at}
}) : base.PARK_ZONES
const sharedBoxes = renewal?.physics.boxes ?? (generated ? p.data.physics.boxes : null)
export const WORLD_COLLIDERS:readonly BoxCollider[] = sharedBoxes ? sharedBoxes.map(b => ({id:b.id,center:b.center,half:b.half,camera:b.role==='solid',movementHalf:b.half,movementYaw:b.yaw})) : base.WORLD_COLLIDERS
const surfaces = p.data.physics.boxes.filter(b => b.role === 'surface')
export function serviceWalkHeight(x:number,z:number) {
  let height=groundHeight(x,z)
  if(generated) for(const b of surfaces) {
    const dx=x-b.center[0],dz=z-b.center[2],c=Math.cos(b.yaw),s=Math.sin(b.yaw)
    if(Math.abs(dx*c-dz*s)<=b.half[0]&&Math.abs(dx*s+dz*c)<=b.half[2])height=Math.max(height,b.center[1]+b.half[1])
  }
  return height
}
export function telescopeLanding(t:typeof TELESCOPES[number],exit=false):Vec3 {
  if(!sharedInteractions)return base.telescopeLanding(t,exit)
  const pose=sharedInteractions.telescopes.find(x=>x.id===t.id)![exit?'exit':'use']
  return [pose.x,pose.y,pose.z]
}
