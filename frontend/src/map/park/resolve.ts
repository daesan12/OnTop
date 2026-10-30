import { roundedSquare } from '../geometry'
import { TOWER_BENCH_SITES } from '../../config/telescopes'
import { TABLES, type TableAnchor } from '../../config/world'
import { PARK_PAVILIONS, MINI_PROPS, MAILBOX, FOUNTAIN, TOWER_SITE,pavilionStairJoin } from '../../config/parkPlan'
import { FITNESS_STATIONS } from '../../config/fitness'
import { VR_COURSE_PADS,groundHeight } from '../../config/parkLayout'
import { resolveLake } from './lake'
import { PARK_DEFINITION,type ParkDefinition } from './definition'
import { buildCollision,isWalkable } from './collision'
import { validateParkDefinition,assertUniqueIds,validatePhysics } from './validate'
import { buildInteractionData } from './interactionData'
import { buildPhysics } from './physics'
import { inKioskEntrance,inMailboxClearing } from './planting'
import { blendFountainEdge } from './fountainHeight'

export type SiteMarker = { no: string; id: string; label: string; x: number; z: number; note: string }
export type ParkPoint = readonly [number,number]
export type DraftRoute = {id:string;points:readonly ParkPoint[];width:number}
export type DraftBox = { id:string; x:number; z:number; halfX:number; halfZ:number }
export type FenceGate={side:'north'|'south'|'east'|'west';offset:number;width:number}
export type FenceCourt={id:string;x:number;z:number;width:number;depth:number;gates:readonly FenceGate[]}
export type FenceRun={id:string;from:ParkPoint;to:ParkPoint}

export function resolveParkLayout(definition:ParkDefinition=PARK_DEFINITION) {
validateParkDefinition(definition)
// Review draft only. Metres, Y-up, north = -Z. This does not replace the live server map.
const DRAFT_PARK={size:definition.park.size,half:definition.park.size/2,backgroundSize:definition.park.backgroundSize,spawn:definition.park.spawn}
const lake=resolveLake(definition.lake)
const {DRAFT_LAKE,DRAFT_LAKE_ROCKS,SHORE_RUNS,FISHING_RAILS,crossingHeight,lakeFloorHeight,fishingHeight}=lake
const SITES={pagoda:definition.sites.pagoda,fountain:definition.sites.fountain,hall:definition.sites.hall,fitness:definition.sites.fitness,event:definition.sites.event,lake:DRAFT_LAKE,tower:definition.sites.tower,vr:definition.sites.vr,folk:definition.sites.folk,vrPagoda:definition.sites.vrPagoda,cart:definition.sites.cart,mailbox:definition.sites.mailbox,shop:definition.sites.shop,drink:definition.sites.drink,photo:definition.sites.photo,fishing:{x:lake.FISHING_DECKS[0]!.x,z:lake.FISHING_DECKS[0]!.z},fishingEast:{x:lake.FISHING_DECKS[1]!.x,z:lake.FISHING_DECKS[1]!.z}}
const DRAFT_FOUNTAIN={scale:definition.fountain.scale,jetHeightScale:definition.fountain.jetHeightScale,plazaRadius:definition.fountain.basePlazaRadius*definition.fountain.scale,basinRadius:definition.fountain.baseBasinRadius*definition.fountain.scale}
const VR_COURT={x:definition.vrCourt.x,z:definition.vrCourt.z,width:definition.vrCourt.width,depth:definition.vrCourt.depth}
const VR_EDGE_TREE_SITES=definition.vrEdgeTrees
const EVENT_GROVE={...SITES.event,width:definition.event.width,depth:definition.event.depth}
const DRAFT_FITNESS_AREA={...SITES.fitness,width:definition.fitness.width,depth:definition.fitness.depth,radius:definition.fitness.radius,rx:definition.fitness.rx,rz:definition.fitness.rz}
const inversionStation=FITNESS_STATIONS.find(s=>s.kind==='inversion')!
const DRAFT_FITNESS_STATIONS=FITNESS_STATIONS.map((station,i)=>{
  // Replace this slot's equipment while retaining its placement and persistent facility ID.
  const s=station.kind==='backmassage'?{...inversionStation,id:station.id,name:'거꾸로 매달리기 2'}:station
  // One radius keeps all stations equally spaced around the central tree.
  const a=(i+.5)*Math.PI*2/FITNESS_STATIONS.length,dx=Math.cos(a)*definition.fitness.stationRadius,dz=Math.sin(a)*definition.fitness.stationRadius
  return {...s,position:[SITES.fitness.x+dx,s.position[1],SITES.fitness.z+dz] as [number,number,number],yaw:Math.atan2(-dx,-dz)}
})
const KIOSKS=(['shop','drink','photo'] as const).map(kind=>({kind,...SITES[kind],scale:1,...definition.kiosks[kind]}))
const EVENT_BENCHES=definition.event.benches
const MAIN_GATE={...definition.gate,z:DRAFT_PARK.half}
const VR_STONE_SETS=definition.vrStoneSets
const DRAFT_TOWER_BENCHES=TOWER_BENCH_SITES.map((b,i)=>({...b,id:'layout-tower-bench-'+(i+1),x:b.x-TOWER_SITE.x+SITES.tower.x,z:b.z-TOWER_SITE.z+SITES.tower.z}))
const VR_YAW=definition.vrCourt.yaw
// Keep the stone model intact; move the lower spiral clear of its wide stepped plinth.
const DRAFT_JUMP_PADS=VR_COURSE_PADS.map((p,i)=>{
  const angle=Math.PI/2+i*Math.PI/4,radius=5.9
  return {...p,id:'future-jump-pad-'+i,x:SITES.vrPagoda.x+Math.cos(angle)*radius,z:SITES.vrPagoda.z+Math.sin(angle)*radius}
})
const PAVILION_COURT=definition.pavilionCourt

// Never derive persistent IDs from array length/order. Keep all 16 current table IDs.
const pavilionPositions=definition.pavilions
const expectKeys=(label:string,actual:readonly string[],expected:readonly string[])=>{
  if(actual.length!==expected.length||expected.some(id=>!actual.includes(id)))throw new Error(label+' must preserve existing IDs')
}
expectKeys('pavilions',Object.keys(pavilionPositions),PARK_PAVILIONS.map(p=>p.id))
expectKeys('tables',Object.keys(definition.tables),TABLES.filter(t=>!t.pavilionId).map(t=>t.id))
const DRAFT_PAVILIONS = PARK_PAVILIONS.map(p => ({ ...p,
  x: pavilionPositions[p.id]![0], z: pavilionPositions[p.id]![1],
}))
const DRAFT_STAIRS=DRAFT_PAVILIONS.map(p=>({id:p.id,x:p.x,z:p.z,floor:p.floor,join:pavilionStairJoin(p.scale),count:Math.ceil(p.floor/.18),tread:.32}))
const otherTablePositions=definition.tables
const DRAFT_TABLES: readonly TableAnchor[] = [...TABLES.map<TableAnchor>(table => {
  const pavilion = DRAFT_PAVILIONS.find(p => p.id === table.pavilionId)
  const point = otherTablePositions[table.id]
  if (!pavilion && !point) throw new Error(`Missing draft placement: ${table.id}`)
  return { ...table, position: pavilion ? [pavilion.x, pavilion.floor, pavilion.z] : [point![0], Math.hypot(point![0]-definition.plaza.x,point![1]-definition.plaza.z)<definition.plaza.pavingRadius?.14:0, point![1]] }
}),...VR_STONE_SETS.map(s=>({id:s.tableId,assetId:'procedural/vr-stone-game-table',position:[s.x,.1,s.z] as const,
  seatAnchors:definition.vrStoneSeats.map(([x,z])=>[x,0,z] as const),spectatorRadius:3.5}))]
assertUniqueIds('game tables',DRAFT_TABLES)

const MARKERS: readonly SiteMarker[] = [
  { no:'01', id:'pavilion-P0', label:'메인 팔각정', x:definition.pavilions.P0![0],z:definition.pavilions.P0![1],note:'기존 중앙 정자·테이블 유지' },
  { no:'02', id:'pavilion-P5', label:'정자별 정원',x:definition.pavilions.P5![0],z:definition.pavilions.P5![1],note:'북쪽 정자 2곳 후퇴 · 일반 정자 P1–P8' },
  { no:'03', id:'garden-pagoda', label:'성장 돌탑 · 높인 광장',...SITES.pagoda,note:'+1.8m 광장 · 사방 계단' },
  { no:'04', id:'vr-experience-hall',label:'VR 체험관',...SITES.vr,note:'VR 한옥 · 민속놀이 한옥 · 옆 석탑' },
  { no:'05', id:'fitness-garden',label:'운동마당',...SITES.fitness,note:'남쪽 타원형 운동마당 · 중앙 큰 나무와 원형 벤치' },
  { no:'06', id:'reference-fountain',label:'분수광장',...SITES.fountain,note:'서북쪽 원형 광장' },
  { no:'07', id:'lake-district',label:'호수',...SITES.lake,note:'세로형 수변 · 두 횡단 동선' },
  { no:'08', id:'spiral-observation-tower',label:'전망대',...SITES.tower,note:'기존 나선형 목조 모델' },
  { no:'09', id:'layout-rest-grove',label:'수목 · 쉼터',x:-73,z:73,note:'기존 피크닉 테이블 ID 유지' },
  { no:'10', id:'layout-fishing-deck',label:'낚시 데크',...SITES.fishing,note:'데크 위치 시안 · 기능 추가 없음' },
  { no:'11', id:'layout-fishing-east',label:'맞은편 낚시터',...SITES.fishingEast,note:'동쪽 수변 접근 공간' },
  { no:'12', id:'layout-background',label:'외곽 건물',x:0,z:-133,note:'도로·보도·건물은 이동 불가 배경' },
  { no:'13', id:'layout-shop',label:'광장 상점',...SITES.shop,note:'건물·진입 공간 시안' },
  { no:'14', id:'layout-drink',label:'응모부스',...SITES.drink,note:'부스 위치 시안' },
  { no:'15', id:'layout-photo',label:'포토부스',...SITES.photo,note:'광장 동쪽 · 촬영 동선 확보' },
  { no:'16', id:'layout-hall-room',label:'민속놀이 존',...SITES.folk,note:'VR 체험관과 구분한 두 번째 한옥' },
  { no:'17', id:'layout-fish-feed',label:'물고기 먹이주기',x:41,z:-14,note:'수변 위치 시안' },
  { no:'18', id:'layout-north-grove',label:'숲 탐색',x:48,z:-73,note:'북동쪽 수목 구역' },
  { no:'19', id:'layout-life-plaza',label:'스폰 · 생활광장',x:definition.plaza.x,z:definition.plaza.z,note:'원형 석재 광장 · 네 방향 돌 테이블 · 숲으로 둘러싼 상점과 부스' },
  { no:'20', id:'layout-event-grove',label:'숲길 · 이벤트 예비지',...SITES.event,note:'도면의 S자 숲길 · 작은 카트 쉼터' },
  { no:'21', id:'layout-main-gate',label:'담장 · 정문',x:0,z:MAIN_GATE.z-1,note:'공원 내부 180 × 180m' },
  { no:'22', id:'layout-wood-bridge',label:'나무다리 · 북쪽 돌다리',x:62,z:9,note:'남쪽 목교 · 북쪽 징검다리 · 수영 진입부' },
  { no:'27', id:'feedback-mailbox',label:'전통 소리함',...SITES.mailbox,note:'기존 코드 모델·시설 ID 유지' },
]
/** Cut the sharp vertices back and use tangent quadratic turns. Keep straight axes straight. */
function roundRoute(points:readonly ParkPoint[],radius=3.5):ParkPoint[] {
  if(points.length<3)return [...points]
  const output:ParkPoint[]=[points[0]!]
  for(let i=1;i<points.length-1;i++) {
    const a=points[i-1]!,p=points[i]!,b=points[i+1]!
    const before=Math.hypot(a[0]-p[0],a[1]-p[1]),after=Math.hypot(b[0]-p[0],b[1]-p[1])
    const cut=Math.min(radius,before*.4,after*.4)
    if(before<.001||after<.001)continue
    const start:ParkPoint=[p[0]+(a[0]-p[0])*cut/before,p[1]+(a[1]-p[1])*cut/before]
    const end:ParkPoint=[p[0]+(b[0]-p[0])*cut/after,p[1]+(b[1]-p[1])*cut/after]
    output.push(start)
    for(let j=1;j<=10;j++) {
      const t=j/10,u=1-t
      output.push([u*u*start[0]+2*u*t*p[0]+t*t*end[0],u*u*start[1]+2*u*t*p[1]+t*t*end[1]])
    }
  }
  output.push(points.at(-1)!);return output
}
const ROUTE_ANCHORS=definition.routes
const curvedRoutes=new Set(definition.curvedRoutes)
const PATHS:readonly DraftRoute[]=ROUTE_ANCHORS.map(route=>({...route,points:curvedRoutes.has(route.id)?roundRoute(route.points,definition.routeTurnRadius):route.points}))
const perimeterOutline=roundedSquare(DRAFT_PARK.half-definition.park.perimeterInset,definition.park.perimeterCornerRadius,24)
const PERIMETER = [...perimeterOutline,perimeterOutline[0]!]

const FENCE_COURTS:readonly FenceCourt[]=[
  ...DRAFT_PAVILIONS.map(p=>({id:`court-${p.id}`,x:p.x,z:p.z,width:p.id==='P0'?26:PAVILION_COURT.width,depth:p.id==='P0'?31:PAVILION_COURT.depth,
    gates:[{side:'north' as const,offset:0,width:p.id==='P0'?8:5.2},{side:'south' as const,offset:0,width:p.id==='P0'?8:5.2},
      ...(p.id==='P0'?[{side:'west' as const,offset:-13,width:5},{side:'east' as const,offset:-13,width:5}]:[])]})),
  {id:'hall-court',...VR_COURT,gates:[{side:'north',offset:0,width:5.8},{side:'south',offset:0,width:5.8},{side:'west',offset:0,width:5.5},{side:'east',offset:4,width:5.5}]},
]
const ROUND_COURTS=[
  {id:'fitness-court',...SITES.fitness,radius:definition.fitness.fenceRx,rx:definition.fitness.fenceRx,rz:definition.fitness.fenceRz,gates:[0,Math.PI/2,Math.PI,Math.PI*1.5],opening:definition.fitness.fenceOpening},
] as const
const KIOSK_FENCE_RUNS=KIOSKS.flatMap(k=>{
  const w=k.width/2+.5,d=k.depth/2+.5
  const at=(x:number,z:number):ParkPoint=>[k.x+x*Math.cos(k.yaw)+z*Math.sin(k.yaw),k.z-x*Math.sin(k.yaw)+z*Math.cos(k.yaw)]
  return [[[-w,-d],[w,-d]],[[-w,-d],[-w,d]],[[w,-d],[w,d]]].map((p,i)=>({id:'kiosk-'+k.kind+'-'+i,from:at(p[0]![0]!,p[0]![1]!),to:at(p[1]![0]!,p[1]![1]!)}))
})
const FENCE_RUNS:readonly FenceRun[]=[...KIOSK_FENCE_RUNS,...FENCE_COURTS.flatMap(court=>{
  const result:FenceRun[]=[]
  for(const side of ['north','south','east','west'] as const) {
    const horizontal=side==='north'||side==='south',length=horizontal?court.width:court.depth
    const gates=court.gates.filter(g=>g.side===side).sort((a,b)=>a.offset-b.offset)
    const at=(n:number):ParkPoint=>horizontal?[court.x+n,court.z+(side==='north'?-1:1)*court.depth/2]:[court.x+(side==='west'?-1:1)*court.width/2,court.z+n]
    let start=-length/2
    for(const gate of gates) {
      const end=gate.offset-gate.width/2
      if(end>start)result.push({id:`${court.id}-${side}-${start}`,from:at(start),to:at(end)})
      start=gate.offset+gate.width/2
    }
    if(start<length/2)result.push({id:`${court.id}-${side}-${start}`,from:at(start),to:at(length/2)})
  }
  return result
}),...ROUND_COURTS.flatMap(c=>Array.from({length:120},(_,i)=>{
  const a=i*Math.PI/60,b=(i+1)*Math.PI/60,mid=(a+b)/2
  if(c.gates.some(g=>Math.abs(Math.atan2(Math.sin(mid-g),Math.cos(mid-g)))<Math.asin(c.opening/2/Math.hypot(Math.sin(g)*c.rx,Math.cos(g)*c.rz))))return []
  return [{id:`${c.id}-arc-${i}`,from:[c.x+Math.cos(a)*c.rx,c.z+Math.sin(a)*c.rz] as const,to:[c.x+Math.cos(b)*c.rx,c.z+Math.sin(b)*c.rz] as const}]
}).flat())]
const CENTRAL_RAIL_RUNS:readonly FenceRun[]=[-1,1].flatMap(side=>[-1,1].flatMap(wing=>{
  const lo=wing<0?-definition.pagoda.terraceHalf:definition.pagoda.railOffset,hi=wing<0?-definition.pagoda.railOffset:definition.pagoda.terraceHalf
  return [{id:'pagoda-rail-h-'+side+'-'+wing,from:[SITES.pagoda.x+lo,SITES.pagoda.z+side*definition.pagoda.terraceHalf] as const,to:[SITES.pagoda.x+hi,SITES.pagoda.z+side*definition.pagoda.terraceHalf] as const},
    {id:'pagoda-rail-v-'+side+'-'+wing,from:[SITES.pagoda.x+side*definition.pagoda.terraceHalf,SITES.pagoda.z+lo] as const,to:[SITES.pagoda.x+side*definition.pagoda.terraceHalf,SITES.pagoda.z+hi] as const}]
}))
const STAIR_RAIL_RUNS=[0,1,2,3].flatMap(side=>[-1,1].map(sign=>{
  const a=side*Math.PI/2,c=Math.cos(a),sn=Math.sin(a),at=(r:number):ParkPoint=>[SITES.pagoda.x+c*r-sn*sign*definition.pagoda.railOffset,SITES.pagoda.z+sn*r+c*sign*definition.pagoda.railOffset]
  return {id:'pagoda-stair-rail-'+side+'-'+sign,from:at(definition.pagoda.terraceHalf),to:at(definition.pagoda.stairEnd)}
}))
const FENCE_BLOCKERS:readonly DraftBox[]=[...FENCE_RUNS,...CENTRAL_RAIL_RUNS,...STAIR_RAIL_RUNS].map(run=>({id:run.id,x:(run.from[0]+run.to[0])/2,z:(run.from[1]+run.to[1])/2,
  halfX:Math.max(.12,Math.abs(run.to[0]-run.from[0])/2),halfZ:Math.max(.12,Math.abs(run.to[1]-run.from[1])/2)}))
const LIFE_PLAZA=definition.plaza
// Removed from the plaza by design; existing benches elsewhere keep their IDs.
const PLAZA_PLANTERS:readonly {id:string;x:number;z:number;radius:number;angle:number}[]=[]
const PLAZA_BEDS:readonly {id:string;x:number;z:number;width:number;depth:number}[]=[]
const PLAZA_BENCHES:readonly {id:string;x:number;z:number;yaw:number}[]=[]
const PLAZA_TREE_SITES=definition.plazaTrees.filter(p=>!inMailboxClearing(p.x,p.z,SITES.mailbox,definition.planting.mailboxTreeClearance)&&Math.hypot(p.x-LIFE_PLAZA.x,p.z-LIFE_PLAZA.z)>LIFE_PLAZA.pavingRadius+.7&&!onPath(p.x,p.z,.9)&&!inKioskEntrance(p.x,p.z,KIOSKS)
  &&!DRAFT_PAVILIONS.some(q=>Math.abs(p.x-q.x)<(q.id==='P0'?15:PAVILION_COURT.width/2+2)&&Math.abs(p.z-q.z)<(q.id==='P0'?18:PAVILION_COURT.depth/2+2))
  &&!KIOSKS.some(k=>{const dx=p.x-k.x,dz=p.z-k.z,c=Math.cos(k.yaw),sn=Math.sin(k.yaw);return Math.abs(dx*c-dz*sn)<k.width/2+1.8&&Math.abs(dx*sn+dz*c)<k.depth/2+1.8}))
  .reduce<{id:string;x:number;z:number}[]>((trees,p)=>{if(!trees.some(t=>Math.hypot(t.x-p.x,t.z-p.z)<2.35))trees.push(p);return trees},[])
const PAVILION_TREE_SITES=definition.pavilionEdgeTrees.filter(p=>!inMailboxClearing(p.x,p.z,SITES.mailbox,definition.planting.mailboxTreeClearance)&&!onPath(p.x,p.z,.55)
  &&!DRAFT_PAVILIONS.some(q=>Math.abs(p.x-q.x)<(q.id==='P0'?13.5:PAVILION_COURT.width/2+.4)&&Math.abs(p.z-q.z)<(q.id==='P0'?16:PAVILION_COURT.depth/2+.4)))
const LANDSCAPE_TREE_SITES=[...PLAZA_TREE_SITES,...PAVILION_TREE_SITES]
const PLAZA_REST_GARDENS=definition.plazaRestGardens
const PLAZA_REST_BENCHES=definition.plazaRestBenches
const PLAZA_BINS=definition.plazaBins
const tableBoxes: DraftBox[] = DRAFT_TABLES.map(t => ({id:t.id,x:t.position[0],z:t.position[2],halfX:t.assetId==='procedural/vr-stone-game-table'?1.2:1.05,halfZ:t.assetId==='procedural/vr-stone-game-table'?.75:.8}))
// The thin floor pad is walkable. Preserve solid machine bounds at their new positions.
const translatedFitness=DRAFT_FITNESS_STATIONS.map(s=>({id:s.id,x:s.position[0],z:s.position[2],
  halfX:1.15*Math.abs(Math.cos(s.yaw))+1.1*Math.abs(Math.sin(s.yaw)),halfZ:1.15*Math.abs(Math.sin(s.yaw))+1.1*Math.abs(Math.cos(s.yaw))}))
const DRAFT_BOXES: readonly DraftBox[] = [
  ...tableBoxes,...translatedFitness,
  ...LANDSCAPE_TREE_SITES.map(p=>({id:p.id,x:p.x,z:p.z,halfX:.25,halfZ:.25})),
  ...PLAZA_REST_GARDENS.map(p=>({id:p.id,x:p.x,z:p.z,halfX:p.width/2,halfZ:p.depth/2})),
  ...PLAZA_REST_BENCHES.map(p=>({id:p.id,x:p.x,z:p.z,halfX:.5,halfZ:1.4})),
  ...PLAZA_BINS.map(p=>({id:p.id,x:p.x,z:p.z,halfX:.34,halfZ:.34})),
  ...VR_EDGE_TREE_SITES.map((p,i)=>({id:"vr-belt-tree-"+i,...p,halfX:.22,halfZ:.22})),
  ...EVENT_BENCHES.map((b,i)=>({id:'event-bench-'+i,x:b.x,z:b.z,halfX:1.4,halfZ:.5})),
  ...definition.forestBenches.map(b=>({id:b.id,x:b.x,z:b.z,halfX:1.4,halfZ:.45})),
  ...VR_STONE_SETS.flatMap(s=>definition.vrStoneSeats.map(([x,z],n)=>({id:s.id+'-chair-'+n,x:s.x+x,z:s.z+z,halfX:.55,halfZ:.55}))),
  ...[-MAIN_GATE.postX,MAIN_GATE.postX].map((x,i)=>({id:'gate-column-'+i,x,z:MAIN_GATE.z,halfX:.38,halfZ:.45})),
  ...PLAZA_BEDS.map(p=>({id:p.id,x:p.x,z:p.z,halfX:p.width/2+.22,halfZ:p.depth/2+.22})),
  ...PLAZA_BENCHES.map(p=>({id:p.id,x:p.x,z:p.z,halfX:1.4*Math.abs(Math.cos(p.yaw))+.5*Math.abs(Math.sin(p.yaw)),halfZ:1.4*Math.abs(Math.sin(p.yaw))+.5*Math.abs(Math.cos(p.yaw))})),
  ...lake.FISHING_DECKS.map((d,i)=>({id:'fishing-bench-'+i,x:d.x-(d.wood?1:-1)*.7,z:d.z-2.15,halfX:1.2,halfZ:.42})),
  {id:'fountain-basin',...SITES.fountain,halfX:DRAFT_FOUNTAIN.basinRadius,halfZ:DRAFT_FOUNTAIN.basinRadius},
  {id:'vr-experience-hall',...SITES.vr,halfX:4.8,halfZ:6.5},
  {id:'layout-hall-room',...SITES.folk,halfX:4.8,halfZ:6.5},
  {id:'vr-stone-pagoda',...SITES.vrPagoda,halfX:4.8,halfZ:4.8},
  ...DRAFT_LAKE_ROCKS.map(r=>({id:r.id,x:r.x,z:r.z,halfX:r.size[0]*.9,halfZ:r.size[2]*.9})),
  {id:'garden-pagoda',...SITES.pagoda,halfX:8,halfZ:8},
  {id:'fish-bread',...SITES.cart,halfX:MINI_PROPS[0].width/2,halfZ:MINI_PROPS[0].depth/2},
  {id:'feedback-mailbox',...SITES.mailbox,halfX:MAILBOX.bodyHalfWidth*definition.mailbox.scale,halfZ:MAILBOX.bodyHalfDepth*definition.mailbox.scale},
  ...KIOSKS.map(k=>({id:`layout-${k.kind}`,x:k.x,z:k.z,halfX:k.width/2*Math.abs(Math.cos(k.yaw))+k.depth/2*Math.abs(Math.sin(k.yaw)),halfZ:k.width/2*Math.abs(Math.sin(k.yaw))+k.depth/2*Math.abs(Math.cos(k.yaw))})),
]
// Lamps sit beside paving, clear of buildings, stairs, water, fences and the pagoda terrace.
const DRAFT_LAMPS:readonly (readonly [number,number,number])[]=(()=>{
  const points:Array<readonly [number,number,number]>=[]
  const add=(x:number,z:number,plaza=false)=>{
    if(!plaza&&Math.hypot(x-LIFE_PLAZA.x,z-LIFE_PLAZA.z)<LIFE_PLAZA.pavingRadius+2)return
    if(Math.abs(x)>86||Math.abs(z)>86||Math.abs(x-SITES.pagoda.x)<19&&Math.abs(z-SITES.pagoda.z)<22)return
    if(Math.hypot((x-SITES.lake.x)/(SITES.lake.rx+2.5),(z-SITES.lake.z)/(SITES.lake.rz+3))<1||Math.hypot(x-SITES.tower.x,z-SITES.tower.z)<13.5||Math.hypot(x-SITES.fountain.x,z-SITES.fountain.z)<DRAFT_FOUNTAIN.plazaRadius+.8)return
    if(DRAFT_PAVILIONS.some(p=>Math.abs(x-p.x)<(p.id==='P0'?14:PAVILION_COURT.width/2+1)&&Math.abs(z-p.z)<(p.id==='P0'?17:PAVILION_COURT.depth/2+1)))return
    if(DRAFT_BOXES.some(b=>Math.abs(x-b.x)<b.halfX+1.5&&Math.abs(z-b.z)<b.halfZ+1.5))return
  if([...FENCE_RUNS,...CENTRAL_RAIL_RUNS,...STAIR_RAIL_RUNS].some(r=>nearSegment(x,z,r.from,r.to)<1.2))return
    if(points.some(p=>Math.hypot(p[0]-x,p[2]-z)<8)||onPath(x,z,.25))return
    points.push([x,0,z])
  }
  // Preserve the seven established plaza lamps when nearby temporary furniture is removed.
  for(const degrees of [15,60,120,165,195,315,345]){const a=degrees*Math.PI/180;add(LIFE_PLAZA.x+Math.cos(a)*21,LIFE_PLAZA.z+Math.sin(a)*21,true)}
  const selected=new Set(['arrival','west-spine','north-cross','hall-south-cross','fitness-north','fitness-cart-link','south-east','lake-east','service-entry','west-pavilions','east-pavilions'])
  for(const r of PATHS.filter(r=>selected.has(r.id)))for(let i=1;i<r.points.length;i++) {
    const a=r.points[i-1]!,b=r.points[i]!,dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),n=Math.floor(length/16)
    for(let j=0;j<n;j++)for(const side of [-1,1]){const t=(j+.5)/Math.max(1,n),offset=r.width/2+1;add(a[0]+dx*t-dz/length*offset*side,a[1]+dz*t+dx/length*offset*side)}
  }
  for(const x of [-30,0,30])for(const z of [23,61])add(x,z)
  for(const [x,z] of [[-32,47],[32,51],[-20,27],[20,27],[-18,57],[18,57],[-77,-65],[-78,-46],[-49,-62],[-57,49],[-73,78],[52,73],[76,73]])add(x!,z!)
  return points
})()
const ORIGINAL_SITES = { fountain:FOUNTAIN, tower:TOWER_SITE }
const fountainGroundHeight=(x:number,z:number)=>blendFountainEdge(Math.hypot(x-SITES.fountain.x,z-SITES.fountain.z),DRAFT_FOUNTAIN.plazaRadius,
  groundHeight(FOUNTAIN.x+(x-SITES.fountain.x)/DRAFT_FOUNTAIN.scale,FOUNTAIN.z+(z-SITES.fountain.z)/DRAFT_FOUNTAIN.scale))
function nearSegment(x:number,z:number,a:readonly number[],b:readonly number[]) {
  const dx=b[0]!-a[0]!,dz=b[1]!-a[1]!,t=Math.max(0,Math.min(1,((x-a[0]!)*dx+(z-a[1]!)*dz)/(dx*dx+dz*dz||1)))
  return Math.hypot(x-a[0]!-t*dx,z-a[1]!-t*dz)
}
function onPath(x:number,z:number,extra=0) {
  return [...PATHS,{points:PERIMETER,width:definition.park.perimeterWidth}].some(p=>p.points.slice(1).some((b,i)=>nearSegment(x,z,p.points[i]!,b)<p.width/2+extra))
}
const COLLISION=buildCollision({definition,boxes:DRAFT_BOXES,kiosks:KIOSKS,fences:[...FENCE_RUNS,...CENTRAL_RAIL_RUNS,...STAIR_RAIL_RUNS],lamps:DRAFT_LAMPS,fishingRails:FISHING_RAILS,shoreRails:SHORE_RUNS})
const canWalk=(x:number,z:number)=>isWalkable(COLLISION,x,z)
/** Preview walking heights only; this is deliberately not an authoritative physics engine. */
function walkHeight(x:number,z:number) {
  const crossing=crossingHeight(x,z)
  if(crossing!==undefined)return crossing
  const dock=fishingHeight(x,z);if(dock!==undefined)return dock
  if(lakeFloorHeight(x,z)<0)return lakeFloorHeight(x,z)
  for(const p of DRAFT_PAVILIONS) {
    const dx=x-p.x,dz=z-p.z,face=4.5*p.scale*Math.cos(Math.PI/8)
    let onFloor=true
    for(let i=0;i<8;i++)if(Math.cos(i*Math.PI/4)*dx+Math.sin(i*Math.PI/4)*dz>face){onFloor=false;break}
    if(onFloor)return p.floor
    const stairLength=Math.ceil(p.floor/.18)*.32,join=pavilionStairJoin(p.scale)
    if(Math.abs(x-p.x)<1.8&&Math.abs(z-p.z)<join+stairLength) return Math.max(0,Math.min(p.floor,p.floor*(1-(Math.abs(z-p.z)-join)/stairLength)))
  }
  if(Math.abs(x-SITES.pagoda.x)<definition.pagoda.terraceHalf&&Math.abs(z-SITES.pagoda.z)<definition.pagoda.terraceHalf) return SITES.pagoda.floor
  for(const [along,across] of [[Math.abs(x-SITES.pagoda.x),Math.abs(z-SITES.pagoda.z)],[Math.abs(z-SITES.pagoda.z),Math.abs(x-SITES.pagoda.x)]])if(across!<=definition.pagoda.stairHalfWidth&&along!>=definition.pagoda.terraceHalf&&along!<=definition.pagoda.terraceHalf+definition.pagoda.steps*definition.pagoda.tread+.01)return Math.min(SITES.pagoda.floor,Math.max(definition.pagoda.riser,Math.ceil((definition.pagoda.terraceHalf+definition.pagoda.steps*definition.pagoda.tread-along!)/definition.pagoda.tread)*definition.pagoda.riser))
  const d=Math.hypot(x-SITES.fountain.x,z-SITES.fountain.z)
  if(d<DRAFT_FOUNTAIN.plazaRadius)return fountainGroundHeight(x,z)
  if(Math.hypot(x-LIFE_PLAZA.x,z-LIFE_PLAZA.z)<=LIFE_PLAZA.pavingRadius)return .14
  return 0
}

const facilityIds={pagoda:'garden-pagoda',fountain:'reference-fountain',fitness:'fitness-garden',tower:'spiral-observation-tower',vr:'vr-experience-hall',folk:'layout-hall-room',vrPagoda:'vr-stone-pagoda',cart:'fish-bread',mailbox:'feedback-mailbox',shop:'layout-shop',drink:'layout-drink',photo:'layout-photo'} as const
const facilities=Object.entries(facilityIds).map(([kind,id])=>{
  const site=SITES[kind as keyof typeof facilityIds],kiosk=KIOSKS.find(k=>k.kind===kind)
  return {id,kind,position:[site.x,kind==='pagoda'?SITES.pagoda.floor:0,site.z] as const,yaw:kiosk?.yaw??(kind==='vr'||kind==='folk'?VR_YAW:0)}
})
const interactionData=buildInteractionData({definition,pavilions:DRAFT_PAVILIONS,towerBenches:DRAFT_TOWER_BENCHES,plazaBenches:PLAZA_BENCHES,restBenches:PLAZA_REST_BENCHES,fitness:DRAFT_FITNESS_STATIONS,decks:lake.FISHING_DECKS})
const terrainHeight=(x:number,z:number)=>lake.lakeRadius(x,z)<1?lakeFloorHeight(x,z):Math.hypot(x-SITES.fountain.x,z-SITES.fountain.z)<DRAFT_FOUNTAIN.plazaRadius?fountainGroundHeight(x,z):0
const physics=buildPhysics({definition,lake,terrainHeight,supportHeight:walkHeight,pavilions:DRAFT_PAVILIONS,stairs:DRAFT_STAIRS,tables:DRAFT_TABLES,fitness:DRAFT_FITNESS_STATIONS,benches:interactionData.benchSites,kiosks:KIOSKS,plazaTrees:LANDSCAPE_TREE_SITES,fences:FENCE_RUNS,centralRails:CENTRAL_RAIL_RUNS,stairRails:STAIR_RAIL_RUNS,lamps:DRAFT_LAMPS})
validatePhysics(physics)
const {benchSites:_benchSites,...facilityInteractions}=interactionData
/** Serializable review data for a future generator; not the agreed Java/server contract. */
const data={
  metadata:definition.metadata,
  world:{...DRAFT_PARK,boundary:COLLISION.boundary,wallCornerRadius:definition.park.wallCornerRadius},
  facilities,pavilions:DRAFT_PAVILIONS,tables:DRAFT_TABLES.map(({spectatorRadius:_unused,...t})=>t),
  interactions:{...facilityInteractions,construction:KIOSKS.map(k=>{
    const distance=k.depth/2+1.8
    return {id:'layout-'+k.kind,kind:'CONSTRUCTION' as const,status:'construction' as const,label:({shop:'상점',drink:'응모부스',photo:'포토부스'})[k.kind],
      position:[k.x,0,k.z] as const,reachPosition:[k.x+Math.sin(k.yaw)*distance,.8,k.z+Math.cos(k.yaw)*distance] as const,
      yaw:k.yaw+Math.PI,radius:3,heightTolerance:.7,message:'현재 공사 중입니다. 준비가 끝나면 이용할 수 있어요.'}
  }),mailbox:{id:'feedback-mailbox',position:[SITES.mailbox.x,0,SITES.mailbox.z],radius:MAILBOX.interactionRadius},tableSeats:DRAFT_TABLES.map(t=>({tableId:t.id,position:t.position,localSeats:t.seatAnchors}))},
  paths:PATHS,perimeter:{points:PERIMETER,width:definition.park.perimeterWidth},
  fences:{courts:FENCE_COURTS,roundCourts:ROUND_COURTS,runs:FENCE_RUNS,centralRails:CENTRAL_RAIL_RUNS,stairRails:STAIR_RAIL_RUNS},
  collision:COLLISION,physics,
  surfaces:{pavilionStairs:DRAFT_STAIRS,pagoda:{...SITES.pagoda,...definition.pagoda},fountain:{...SITES.fountain,...DRAFT_FOUNTAIN},lake:{...DRAFT_LAKE,depth:definition.lake.depth,swimmingThreshold:definition.lake.swimmingThreshold},crossings:lake.CROSSINGS,bridgeLandings:lake.BRIDGE_LANDINGS,fishingDecks:lake.FISHING_DECKS,fishingLandings:lake.FISHING_LANDINGS},
}
assertUniqueIds('facilities',facilities)
assertUniqueIds('collision',COLLISION.obstacles)
assertUniqueIds('physical shapes',[...physics.boxes,...physics.meshes,...physics.hulls])
assertUniqueIds('interaction facilities',[...facilityInteractions.benches,...facilityInteractions.fitness,...facilityInteractions.telescopes])
if(!canWalk(...DRAFT_PARK.spawn))throw new Error('park.spawn is blocked')
if(lake.swimmingAt(...DRAFT_PARK.spawn))throw new Error('park.spawn cannot be underwater')
return {data,SETTINGS:definition,PAVILION_TREE_SITES,PLAZA_TREE_SITES,DRAFT_FITNESS_STATIONS,DRAFT_TOWER_BENCHES,DRAFT_JUMP_PADS,DRAFT_PAVILIONS,DRAFT_STAIRS,DRAFT_TABLES,MARKERS,roundRoute,PATHS,PERIMETER,FENCE_COURTS,ROUND_COURTS,KIOSK_FENCE_RUNS,FENCE_RUNS,CENTRAL_RAIL_RUNS,STAIR_RAIL_RUNS,FENCE_BLOCKERS,PLAZA_PLANTERS,PLAZA_BEDS,PLAZA_BENCHES,DRAFT_BOXES,DRAFT_LAMPS,ORIGINAL_SITES,fountainGroundHeight,nearSegment,onPath,walkHeight,COLLISION,canWalk,lake,DRAFT_PARK,SITES,DRAFT_FOUNTAIN,VR_COURT,VR_EDGE_TREE_SITES,EVENT_GROVE,DRAFT_FITNESS_AREA,KIOSKS,EVENT_BENCHES,MAIN_GATE,VR_STONE_SETS,VR_YAW,PAVILION_COURT,LIFE_PLAZA,PLAZA_REST_GARDENS,PLAZA_REST_BENCHES,PLAZA_BINS}
}
