import { roundedSquare,insideRoundedSquare } from '../world/art/roundedOutline'
import { TOWER_BENCH_SITES } from '../config/telescopes'
import { TABLES, type TableAnchor } from '../config/world'
import { PARK_PAVILIONS, MINI_PROPS, MAILBOX, FOUNTAIN, TOWER_SITE,pavilionStairJoin } from '../config/parkPlan'
import { FITNESS_STATIONS } from '../config/fitness'
import { VR_COURSE_PADS,groundHeight } from '../config/parkLayout'
import { DRAFT_LAKE,DRAFT_LAKE_ROCKS,SHORE_RUNS,FISHING_RAILS,crossingHeight,lakeFloorHeight,fishingHeight } from './lakeLayout'

// Review draft only. Metres, Y-up, north = -Z. This does not replace the live server map.
export const DRAFT_PARK = { size: 180, half: 90, backgroundSize: 316, spawn: [0, 82] as const }
export const SITES = {
  pagoda: { x: 0, z: -40, floor: 1.8 }, fountain: { x: -63, z: -56 },
  hall: { x: -62, z: -12 }, fitness: { x: -63, z: 64 },
  event:{x:-64,z:21},
  lake: DRAFT_LAKE, tower: { x: 62, z: 56 },
  vr: {x:-74,z:-23},folk:{x:-74,z:-3},vrPagoda:{x:-53,z:-23},
  cart: { x: -51, z: 23 }, mailbox: { x: -18, z: 18 },
  shop: { x: -29, z: 35 }, drink: { x: -26, z: 50.5 }, photo: { x: 29, z: 35 },
  balloon: { x: -35, z: 29 }, fishing: { x: 49, z: -43 }, fishingEast: { x: 79, z: -43 },
} as const
export const DRAFT_FOUNTAIN={scale:1.22,jetHeightScale:1.65,plazaRadius:14.4*1.22,basinRadius:5.2*1.22} as const
export const VR_COURT={x:-63,z:SITES.hall.z,width:34,depth:40}
export const VR_EDGE_TREE_SITES=[
  ...[-27,-21,-15,-2,4].map(z=>({x:-43.4,z})),...[-27,-21,-3,3].map(z=>({x:-81.1,z})),
  ...[-77,-71,-55,-49].flatMap(x=>[{x,z:-33.1},{x,z:9.1}]),
]
export const EVENT_GROVE={...SITES.event,width:32,depth:26}
export const DRAFT_FITNESS_AREA={...SITES.fitness,width:30,depth:22,radius:15,rx:15,rz:11}
export const DRAFT_FITNESS_STATIONS=FITNESS_STATIONS.map((s,i)=>{
  const a=(i+.5)*Math.PI*2/FITNESS_STATIONS.length,dx=Math.cos(a)*11.5,dz=Math.sin(a)*7.5
  return {...s,position:[SITES.fitness.x+dx,s.position[1],SITES.fitness.z+dz] as [number,number,number],yaw:Math.atan2(-dx,-dz)}
})
export const KIOSKS=(['shop','drink','photo'] as const).map(kind=>({kind,...SITES[kind],scale:1,
  width:kind==='shop'?9.6:kind==='drink'?7.8:8.8,depth:kind==='shop'?7.2:kind==='drink'?5:6.6,
  yaw:kind==='shop'?Math.PI/4:kind==='drink'?0:-Math.PI/4}))
export const EVENT_BENCHES=[{x:-75,z:14,side:-1},{x:-57,z:26,side:1}] as const
export const MAIN_GATE={opening:5.2,boundaryOpening:5.2,postX:2.6,z:90} as const
export const VR_STONE_SETS=[{id:'layout-vr-stone-set-1',x:-53,z:-8},{id:'layout-vr-stone-set-2',x:-53,z:2}] as const
export const DRAFT_TOWER_BENCHES=TOWER_BENCH_SITES.map((b,i)=>({...b,id:'layout-tower-bench-'+(i+1),x:b.x-TOWER_SITE.x+SITES.tower.x,z:b.z-TOWER_SITE.z+SITES.tower.z}))
export const VR_YAW=Math.PI/2
// Keep the stone model intact; move the lower spiral clear of its wide stepped plinth.
export const DRAFT_JUMP_PADS=VR_COURSE_PADS.map((p,i)=>{
  const angle=Math.PI/2+i*Math.PI/4,radius=5.9
  return {...p,id:'future-jump-pad-'+i,x:SITES.vrPagoda.x+Math.cos(angle)*radius,z:SITES.vrPagoda.z+Math.sin(angle)*radius}
})
export const PAVILION_COURT={width:14.5,depth:17} as const

// Never derive persistent IDs from array length/order. Keep all 16 current table IDs.
const pavilionPositions: Record<string, readonly [number, number]> = {
  P0: [0, 6], P1: [-24, 4], P2: [24, 4], P3: [-24, -20], P4: [24, -20],
  P5: [-24, -61], P6: [24, -61], P7: [-24, 74], P8: [24, 74],
}
export const DRAFT_PAVILIONS = PARK_PAVILIONS.map(p => ({ ...p,
  x: pavilionPositions[p.id]![0], z: pavilionPositions[p.id]![1],
}))
export const DRAFT_STAIRS=DRAFT_PAVILIONS.map(p=>({id:p.id,x:p.x,z:p.z,floor:p.floor,join:pavilionStairJoin(p.scale),count:Math.ceil(p.floor/.18),tread:.32}))
const otherTablePositions: Record<string, readonly [number, number]> = {
  'table-1': [-10, 32], 'table-2': [10, 32], 'table-3': [-10, 52], 'table-4': [10, 52],
  'table-14': [-73, 48], 'table-15': [48, -72], 'table-16': [71, 75],
}
export const DRAFT_TABLES: readonly TableAnchor[] = TABLES.map(table => {
  const pavilion = DRAFT_PAVILIONS.find(p => p.id === table.pavilionId)
  const point = otherTablePositions[table.id]
  if (!pavilion && !point) throw new Error(`Missing draft placement: ${table.id}`)
  return { ...table, position: pavilion ? [pavilion.x, pavilion.floor, pavilion.z] : [point![0], 0, point![1]] }
})

export type SiteMarker = { no: string; id: string; label: string; x: number; z: number; note: string }
export const MARKERS: readonly SiteMarker[] = [
  { no:'01', id:'pavilion-P0', label:'메인 팔각정', x:0,z:6,note:'기존 중앙 정자·테이블 유지' },
  { no:'02', id:'pavilion-P5', label:'정자별 정원',x:-24,z:-61,note:'북쪽 정자 2곳 후퇴 · 일반 정자 P1–P8' },
  { no:'03', id:'garden-pagoda', label:'성장 돌탑 · 높인 광장',...SITES.pagoda,note:'+1.8m 광장 · 사방 계단' },
  { no:'04', id:'vr-experience-hall',label:'VR 체험관',...SITES.vr,note:'VR 한옥 · 민속놀이 한옥 · 옆 석탑' },
  { no:'05', id:'fitness-garden',label:'운동마당',...SITES.fitness,note:'남쪽 타원형 운동마당 · 중앙 큰 나무와 원형 벤치' },
  { no:'06', id:'reference-fountain',label:'분수광장',...SITES.fountain,note:'서북쪽 원형 광장' },
  { no:'07', id:'lake-district',label:'호수',...SITES.lake,note:'세로형 수변 · 두 횡단 동선' },
  { no:'08', id:'spiral-observation-tower',label:'전망대',...SITES.tower,note:'기존 나선형 목조 모델' },
  { no:'09', id:'layout-rest-grove',label:'수목 · 쉼터',x:-73,z:73,note:'기존 피크닉 테이블 ID 유지' },
  { no:'10', id:'layout-fishing-deck',label:'낚시 데크',...SITES.fishing,note:'데크 위치 시안 · 기능 추가 없음' },
  { no:'11', id:'layout-fishing-east',label:'맞은편 낚시터',...SITES.fishingEast,note:'동쪽 수변 접근 공간' },
  { no:'12', id:'layout-background',label:'외곽 광고 건물',x:0,z:-133,note:'도로·보도·건물은 이동 불가 배경' },
  { no:'13', id:'layout-shop',label:'광장 상점',...SITES.shop,note:'건물·진입 공간 시안' },
  { no:'14', id:'layout-drink',label:'응모부스',...SITES.drink,note:'부스 위치 시안' },
  { no:'15', id:'layout-photo',label:'포토부스',...SITES.photo,note:'광장 동쪽 · 촬영 동선 확보' },
  { no:'16', id:'layout-hall-room',label:'민속놀이 존',...SITES.folk,note:'VR 체험관과 구분한 두 번째 한옥' },
  { no:'17', id:'layout-fish-feed',label:'물고기 먹이주기',x:41,z:-14,note:'수변 위치 시안' },
  { no:'18', id:'layout-north-grove',label:'숲 탐색',x:48,z:-73,note:'북동쪽 수목 구역' },
  { no:'19', id:'layout-life-plaza',label:'스폰 · 생활광장',x:0,z:42,note:'블록 광장 · 원형 스폰 문양 · 가장자리 소형 건물' },
  { no:'20', id:'layout-event-grove',label:'숲길 · 이벤트 예비지',...SITES.event,note:'도면의 S자 숲길 · 작은 카트 쉼터' },
  { no:'21', id:'layout-main-gate',label:'담장 · 정문',x:0,z:89,note:'공원 내부 180 × 180m' },
  { no:'22', id:'layout-wood-bridge',label:'나무다리 · 북쪽 돌다리',x:62,z:9,note:'남쪽 목교 · 북쪽 징검다리 · 수영 진입부' },
  { no:'23', id:'a-frame-arrival',label:'A1 · 상점 옆 광고판',x:-16,z:32,note:'기존 광고판 ID 유지' },
  { no:'24', id:'a-frame-pavilion',label:'A2 · 체험관 옆 광고판',x:-35,z:-13,note:'기존 광고판 ID 유지 · 직선 통로 옆으로 이동' },
  { no:'25', id:'a-frame-west-walk',label:'A3 · 분수 진입 광고판',x:-57,z:-40,note:'기존 광고판 ID 유지' },
  { no:'26', id:'advertising-balloon',label:'에어벌룬 광고',...SITES.balloon,note:'풍선 2개 · 중심 13m · 지상 추 없음' },
  { no:'27', id:'feedback-mailbox',label:'전통 소리함',...SITES.mailbox,note:'기존 코드 모델·시설 ID 유지' },
]
export type ParkPoint = readonly [number,number]
export type DraftRoute = {id:string;points:readonly ParkPoint[];width:number}
/** Cut the sharp vertices back and use tangent quadratic turns. Keep straight axes straight. */
export function roundRoute(points:readonly ParkPoint[],radius=3.5):ParkPoint[] {
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
const ROUTE_ANCHORS:readonly DraftRoute[] = [
  {id:'arrival', points:[[0,88],[0,20]],width:8},
  {id:'central-north',points:[[0,-8],[0,-27]],width:6},
  {id:'pagoda-west',points:[[-39,-40],[-13,-40]],width:6},
  {id:'pagoda-east',points:[[13,-40],[39,-40]],width:6},
  {id:'north-exit',points:[[0,-53],[0,-84]],width:6},
  {id:'west-pavilions',points:[[-24,27],[-24,-76]],width:4},
  {id:'east-pavilions',points:[[24,27],[24,-76]],width:4},
  {id:'west-south-pavilion',points:[[-24,62],[-24,86]],width:4},
  {id:'east-south-pavilion',points:[[24,62],[24,86]],width:4},
  {id:'north-cross',points:[[-39,-76],[84,-76]],width:4},
  {id:'upper-west-cross',points:[[-63,-36],[-39,-36]],width:4},
  {id:'upper-cross',points:[[-39,-36],[-39,-40],[39,-40]],width:4},
  {id:'stone-approach',points:[[39,-40],[39,-26],[84,-26]],width:4},
  {id:'west-spine',points:[[-39,-76],[-39,84]],width:4},
  {id:'middle-cross',points:[[-50,-8],[39,-8]],width:4},
  {id:'hall-south-cross',points:[[-84,12],[-39,12]],width:4},
  {id:'hall-entrance',points:[[-62,12],[-62,-23]],width:4},
  {id:'garden-cross',points:[[-39,25],[39,25]],width:6},
  {id:'pavilion-east-lane',points:[[14.9,-8],[14.9,25]],width:2.6},
  {id:'pavilion-west-lane',points:[[-14.9,-8],[-14.9,25]],width:2.6},
  {id:'wood-approach',points:[[39,27],[39,9],[84,9]],width:4},
  {id:'south-cross',points:[[-82,81],[-39,81]],width:3.5},
  {id:'fitness-north',points:[[-63,31],[-63,53]],width:3.5},
  {id:'fitness-cart-link',points:[[-63,47],[-56,43],[-51,37],[-51,25.5]],width:3.5},
  {id:'fitness-west',points:[[-84,64],[-78,64]],width:3.5},
  {id:'fitness-south',points:[[-63,75],[-63,84]],width:3.5},
  {id:'fitness-main',points:[[-48,64],[-39,64],[-39,56],[-12,56]],width:3.5},
  {id:'service-entry',points:[[-39,62],[39,62]],width:4},
  {id:'service-plaza',points:[[-39,43],[-12,43]],width:3},
  {id:'photo-plaza',points:[[14,43],[22,43],[26,40]],width:3},
  {id:'photo-front',points:[[26,40],[26,62]],width:3.5},
  {id:'photo-north',points:[[29,25],[29,28]],width:3.5},
  {id:'fountain-south',points:[[-63,-42],[-63,-36]],width:4},
  {id:'fountain-vr',points:[[-63,-42],[-63,-32],[-62,-32]],width:3.5},
  {id:'vr-west-entry',points:[[-84,-12],[-62,-12]],width:3},
  {id:'fountain-east',points:[[-49,-56],[-39,-56],[-39,-76]],width:4},
  {id:'fountain-north-grove',points:[[-76,-84],[-70,-78],[-65,-73],[-63,-70]],width:3},
  {id:'fountain-west',points:[[-84,-56],[-77,-56]],width:3.5},
  {id:'event-winding',points:[[-63,12],[-63,15],[-70,18],[-73,22],[-68,26],[-60,30],[-49,31],[-39,31]],width:3},
  {id:'event-west',points:[[-84,22],[-73,22]],width:3},
  {id:'cart-access',points:[[-51,31],[-51,25.5]],width:2.8},
  {id:'south-east',points:[[39,27],[39,81],[82,81]],width:4},
  {id:'tower-west',points:[[39,56],[50.5,56]],width:4},
  {id:'tower-east',points:[[73.5,56],[84,56]],width:4},
  {id:'tower-south',points:[[62,67.5],[62,81]],width:4},
  {id:'tower-north',points:[[62,38],[62,44.5]],width:3},
  {id:'tower-garden-link',points:[[39,38],[62,38]],width:3},
  {id:'tower-loop',points:Array.from({length:65},(_,i)=>[62+Math.cos(i*Math.PI/32)*11.5,56+Math.sin(i*Math.PI/32)*11.5] as const),width:2.4},
  {id:'lake-west',points:[[39,-76],[39,31]],width:3.5},
  {id:'swim-west',points:[[39,-14],[46,-14]],width:3.5},
  {id:'swim-east',points:[[78,-14],[84,-14]],width:3.5},
  {id:'fishing-west',points:[[39,-43],[49,-43]],width:3.5},
  {id:'fishing-east',points:[[79,-43],[84,-43]],width:3.5},
  {id:'lake-east',points:[[84,-77],[84,77]],width:3.5},
] as const
const curvedRoutes=new Set(['event-winding','fountain-north-grove','fitness-cart-link','photo-plaza'])
export const PATHS:readonly DraftRoute[]=ROUTE_ANCHORS.map(route=>({...route,points:curvedRoutes.has(route.id)?roundRoute(route.points):route.points}))
const perimeterOutline=roundedSquare(84,7,24)
export const PERIMETER = [...perimeterOutline,perimeterOutline[0]!]

export type DraftBox = { id:string; x:number; z:number; halfX:number; halfZ:number }
export type FenceGate={side:'north'|'south'|'east'|'west';offset:number;width:number}
export type FenceCourt={id:string;x:number;z:number;width:number;depth:number;gates:readonly FenceGate[]}
export const FENCE_COURTS:readonly FenceCourt[]=[
  ...DRAFT_PAVILIONS.map(p=>({id:`court-${p.id}`,x:p.x,z:p.z,width:p.id==='P0'?26:PAVILION_COURT.width,depth:p.id==='P0'?31:PAVILION_COURT.depth,
    gates:[{side:'north' as const,offset:0,width:p.id==='P0'?8:5.2},{side:'south' as const,offset:0,width:p.id==='P0'?8:5.2},
      ...(p.id==='P0'?[{side:'west' as const,offset:-13,width:5},{side:'east' as const,offset:-13,width:5}]:[])]})),
  {id:'hall-court',...VR_COURT,gates:[{side:'north',offset:0,width:5.8},{side:'south',offset:0,width:5.8},{side:'west',offset:0,width:5.5},{side:'east',offset:4,width:5.5}]},
]
export const ROUND_COURTS=[
  {id:'fitness-court',...SITES.fitness,radius:16.2,rx:16.2,rz:12.2,gates:[0,Math.PI/2,Math.PI,Math.PI*1.5],opening:5.6},
] as const
export const KIOSK_FENCE_RUNS=KIOSKS.flatMap(k=>{
  const w=k.width/2+.5,d=k.depth/2+.5
  const at=(x:number,z:number):ParkPoint=>[k.x+x*Math.cos(k.yaw)+z*Math.sin(k.yaw),k.z-x*Math.sin(k.yaw)+z*Math.cos(k.yaw)]
  return [[[-w,-d],[w,-d]],[[-w,-d],[-w,d]],[[w,-d],[w,d]]].map((p,i)=>({id:'kiosk-'+k.kind+'-'+i,from:at(p[0]![0]!,p[0]![1]!),to:at(p[1]![0]!,p[1]![1]!)}))
})
export type FenceRun={id:string;from:ParkPoint;to:ParkPoint}
export const FENCE_RUNS:readonly FenceRun[]=[...KIOSK_FENCE_RUNS,...FENCE_COURTS.flatMap(court=>{
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
export const CENTRAL_RAIL_RUNS:readonly FenceRun[]=[-1,1].flatMap(side=>[-1,1].flatMap(wing=>{
  const lo=wing<0?-13:2.75,hi=wing<0?-2.75:13
  return [{id:'pagoda-rail-h-'+side+'-'+wing,from:[lo,SITES.pagoda.z+side*13] as const,to:[hi,SITES.pagoda.z+side*13] as const},
    {id:'pagoda-rail-v-'+side+'-'+wing,from:[side*13,SITES.pagoda.z+lo] as const,to:[side*13,SITES.pagoda.z+hi] as const}]
}))
export const STAIR_RAIL_RUNS=[0,1,2,3].flatMap(side=>[-1,1].map(sign=>{
  const a=side*Math.PI/2,c=Math.cos(a),sn=Math.sin(a),at=(r:number):ParkPoint=>[c*r-sn*sign*2.75,SITES.pagoda.z+sn*r+c*sign*2.75]
  return {id:'pagoda-stair-rail-'+side+'-'+sign,from:at(13),to:at(17.4)}
}))
export const FENCE_BLOCKERS:readonly DraftBox[]=[...FENCE_RUNS,...CENTRAL_RAIL_RUNS,...STAIR_RAIL_RUNS].map(run=>({id:run.id,x:(run.from[0]+run.to[0])/2,z:(run.from[1]+run.to[1])/2,
  halfX:Math.max(.12,Math.abs(run.to[0]-run.from[0])/2),halfZ:Math.max(.12,Math.abs(run.to[1]-run.from[1])/2)}))
export const LIFE_PLAZA={x:0,z:42,radius:7.4,width:70,depth:34} as const
// Solid planting islands sit outside the circular paving, away from its four entrances.
export const PLAZA_PLANTERS=[30,150,210,330].map(degrees=>{
  const angle=degrees*Math.PI/180
  return {id:`plaza-planter-${degrees}`,x:Math.cos(angle)*16,z:42+Math.sin(angle)*16,radius:1.1,angle}
})
export const PLAZA_BEDS=PLAZA_PLANTERS.filter(p=>p.z>42).map(p=>({id:p.id,x:p.x,z:p.z,width:1.8,depth:4.5}))
export const PLAZA_BENCHES=PLAZA_PLANTERS.filter(p=>p.z>42).map(p=>({id:p.id+'-bench',x:p.x-Math.cos(p.angle)*2.4,z:p.z-Math.sin(p.angle)*2.4,yaw:-Math.PI/2-p.angle}))
export const PLAZA_REST_GARDENS=[-1,1].map(side=>({id:'plaza-rest-garden-'+side,x:side*19.3,z:34.5,width:4.6,depth:6.8,side}))
export const PLAZA_REST_BENCHES=[-1,1].flatMap(side=>[33,36].map(z=>({id:'plaza-rest-bench-'+side+'-'+z,x:side*16.3,z,yaw:-side*Math.PI/2})))
export const PLAZA_BINS=[-1,1].map(side=>({id:'plaza-bin-'+side,x:side*16.5,z:39}))
const tableBoxes: DraftBox[] = DRAFT_TABLES.map(t => ({id:t.id,x:t.position[0],z:t.position[2],halfX:1.05,halfZ:.8}))
// The thin floor pad is walkable. Preserve solid machine bounds at their new positions.
const translatedFitness=DRAFT_FITNESS_STATIONS.map(s=>({id:s.id,x:s.position[0],z:s.position[2],
  halfX:1.15*Math.abs(Math.cos(s.yaw))+1.1*Math.abs(Math.sin(s.yaw)),halfZ:1.15*Math.abs(Math.sin(s.yaw))+1.1*Math.abs(Math.cos(s.yaw))}))
export const DRAFT_BOXES: readonly DraftBox[] = [
  ...tableBoxes,...translatedFitness,
  ...PLAZA_REST_GARDENS.map(p=>({id:p.id,x:p.x,z:p.z,halfX:p.width/2,halfZ:p.depth/2})),
  ...PLAZA_REST_BENCHES.map(p=>({id:p.id,x:p.x,z:p.z,halfX:.5,halfZ:1.4})),
  ...PLAZA_BINS.map(p=>({id:p.id,x:p.x,z:p.z,halfX:.34,halfZ:.34})),
  ...VR_EDGE_TREE_SITES.map((p,i)=>({id:"vr-belt-tree-"+i,...p,halfX:.22,halfZ:.22})),
  ...EVENT_BENCHES.map((b,i)=>({id:'event-bench-'+i,x:b.x,z:b.z,halfX:1.4,halfZ:.5})),
  ...VR_STONE_SETS.flatMap(s=>[{id:s.id,x:s.x,z:s.z,halfX:1.25,halfZ:.85},...[-1,1].map(side=>({id:s.id+'-chair-'+side,x:s.x,z:s.z+side*1.8,halfX:.55,halfZ:.55}))]),
  ...[-MAIN_GATE.postX,MAIN_GATE.postX].map((x,i)=>({id:'gate-column-'+i,x,z:MAIN_GATE.z,halfX:.38,halfZ:.45})),
  ...PLAZA_BEDS.map(p=>({id:p.id,x:p.x,z:p.z,halfX:p.width/2+.22,halfZ:p.depth/2+.22})),
  ...PLAZA_BENCHES.map(p=>({id:p.id,x:p.x,z:p.z,halfX:1.4*Math.abs(Math.cos(p.yaw))+.5*Math.abs(Math.sin(p.yaw)),halfZ:1.4*Math.abs(Math.sin(p.yaw))+.5*Math.abs(Math.cos(p.yaw))})),
  ...[{x:48.3,z:-45.15},{x:79.7,z:-45.15}].map((p,i)=>({id:'fishing-bench-'+i,...p,halfX:1.2,halfZ:.42})),
  {id:'fountain-basin',...SITES.fountain,halfX:DRAFT_FOUNTAIN.basinRadius,halfZ:DRAFT_FOUNTAIN.basinRadius},
  {id:'vr-experience-hall',...SITES.vr,halfX:4.8,halfZ:6.5},
  {id:'layout-hall-room',...SITES.folk,halfX:4.8,halfZ:6.5},
  {id:'vr-stone-pagoda',...SITES.vrPagoda,halfX:4.8,halfZ:4.8},
  ...DRAFT_LAKE_ROCKS.map(r=>({id:r.id,x:r.x,z:r.z,halfX:r.size[0]*.9,halfZ:r.size[2]*.9})),
  {id:'garden-pagoda',...SITES.pagoda,halfX:8,halfZ:8},
  {id:'fish-bread',...SITES.cart,halfX:MINI_PROPS[0].width/2,halfZ:MINI_PROPS[0].depth/2},
  {id:'feedback-mailbox',...SITES.mailbox,halfX:MAILBOX.bodyHalfWidth,halfZ:MAILBOX.bodyHalfDepth},
  ...KIOSKS.map(k=>({id:`layout-${k.kind}`,x:k.x,z:k.z,halfX:k.width/2*Math.abs(Math.cos(k.yaw))+k.depth/2*Math.abs(Math.sin(k.yaw)),halfZ:k.width/2*Math.abs(Math.sin(k.yaw))+k.depth/2*Math.abs(Math.cos(k.yaw))})),
  ...MARKERS.filter(m => m.no==='23'||m.no==='24'||m.no==='25').map(m=>({id:m.id,x:m.x,z:m.z,halfX:.7,halfZ:.5})),
]
// Lamps sit beside paving, clear of buildings, stairs, water, fences and the pagoda terrace.
export const DRAFT_LAMPS:readonly (readonly [number,number,number])[]=(()=>{
  const points:Array<readonly [number,number,number]>=[]
  const add=(x:number,z:number,plaza=false)=>{
    if(!plaza&&Math.abs(x)<36&&z>23&&z<61)return
    if(Math.abs(x)>86||Math.abs(z)>86||Math.abs(x)<19&&Math.abs(z+40)<22)return
    if(Math.hypot((x-62)/20.5,(z+14)/46)<1||Math.hypot(x-62,z-56)<13.5||Math.hypot(x-SITES.fountain.x,z-SITES.fountain.z)<DRAFT_FOUNTAIN.plazaRadius+.8)return
    if(DRAFT_PAVILIONS.some(p=>Math.abs(x-p.x)<(p.id==='P0'?14:PAVILION_COURT.width/2+1)&&Math.abs(z-p.z)<(p.id==='P0'?17:PAVILION_COURT.depth/2+1)))return
    if(DRAFT_BOXES.some(b=>Math.abs(x-b.x)<b.halfX+1.5&&Math.abs(z-b.z)<b.halfZ+1.5))return
  if([...FENCE_RUNS,...CENTRAL_RAIL_RUNS,...STAIR_RAIL_RUNS].some(r=>nearSegment(x,z,r.from,r.to)<1.2))return
    if(points.some(p=>Math.hypot(p[0]-x,p[2]-z)<8)||onPath(x,z,.25))return
    points.push([x,0,z])
  }
  for(const [x,z] of [[-33.5,45.5],[33.5,45.5],[-33.5,56.5],[33.5,56.5],[-8,58.5],[8,58.5]])add(x!,z!,true)
  const selected=new Set(['arrival','west-spine','north-cross','hall-south-cross','fitness-north','fitness-cart-link','south-east','lake-east','service-entry','west-pavilions','east-pavilions'])
  for(const r of PATHS.filter(r=>selected.has(r.id)))for(let i=1;i<r.points.length;i++) {
    const a=r.points[i-1]!,b=r.points[i]!,dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),n=Math.floor(length/16)
    for(let j=0;j<n;j++)for(const side of [-1,1]){const t=(j+.5)/Math.max(1,n),offset=r.width/2+1;add(a[0]+dx*t-dz/length*offset*side,a[1]+dz*t+dx/length*offset*side)}
  }
  for(const x of [-30,0,30])for(const z of [23,61])add(x,z)
  for(const [x,z] of [[-32,47],[32,51],[-20,27],[20,27],[-18,57],[18,57],[-77,-65],[-78,-46],[-49,-62],[-57,49],[-73,78],[52,73],[76,73]])add(x!,z!)
  return points
})()
export const ORIGINAL_SITES = { fountain:FOUNTAIN, tower:TOWER_SITE }
export const fountainGroundHeight=(x:number,z:number)=>groundHeight(FOUNTAIN.x+(x-SITES.fountain.x)/DRAFT_FOUNTAIN.scale,FOUNTAIN.z+(z-SITES.fountain.z)/DRAFT_FOUNTAIN.scale)
export function nearSegment(x:number,z:number,a:readonly number[],b:readonly number[]) {
  const dx=b[0]!-a[0]!,dz=b[1]!-a[1]!,t=Math.max(0,Math.min(1,((x-a[0]!)*dx+(z-a[1]!)*dz)/(dx*dx+dz*dz||1)))
  return Math.hypot(x-a[0]!-t*dx,z-a[1]!-t*dz)
}
export function onPath(x:number,z:number,extra=0) {
  return [...PATHS,{points:PERIMETER,width:3.5}].some(p=>p.points.slice(1).some((b,i)=>nearSegment(x,z,p.points[i]!,b)<p.width/2+extra))
}
export function canWalk(x:number,z:number) {
  if(!Number.isFinite(x)||!Number.isFinite(z)||!insideRoundedSquare(x,z,88.8,4.8)) return false
  if(DRAFT_BOXES.some(b=>!['layout-shop','layout-drink','layout-photo'].includes(b.id)&&Math.abs(x-b.x)<b.halfX+.3&&Math.abs(z-b.z)<b.halfZ+.3)) return false
  for(const k of KIOSKS){const dx=x-k.x,dz=z-k.z,lx=dx*Math.cos(k.yaw)-dz*Math.sin(k.yaw),lz=dx*Math.sin(k.yaw)+dz*Math.cos(k.yaw);if(Math.abs(lx)<k.width/2+.3&&Math.abs(lz)<k.depth/2+.3)return false}
  if([...FENCE_RUNS,...CENTRAL_RAIL_RUNS,...STAIR_RAIL_RUNS].some(r=>nearSegment(x,z,r.from,r.to)<.46))return false
  if(DRAFT_LAMPS.some(p=>Math.hypot(x-p[0],z-p[2])<.48))return false
  if(FISHING_RAILS.some(r=>nearSegment(x,z,r.from,r.to)<.32))return false
  if(SHORE_RUNS.some(r=>nearSegment(x,z,r.from,r.to)<.4))return false
  const dx=x-SITES.fitness.x,dz=z-SITES.fitness.z,r=Math.hypot(dx,dz)
  if(r<.95||r>2.45&&r<3.65&&Math.abs(Math.sin(Math.atan2(dz,dx)*2))>.35)return false
  return true
}
/** Preview walking heights only; this is deliberately not an authoritative physics engine. */
export function walkHeight(x:number,z:number) {
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
  if(Math.abs(x)<13&&Math.abs(z+40)<13) return 1.8
  for(const [along,across] of [[Math.abs(x),Math.abs(z+40)],[Math.abs(z+40),Math.abs(x)]])if(across!<=3&&along!>=13&&along!<=17.01)return Math.min(1.8,Math.max(.18,Math.ceil((17-along!)/.4)*.18))
  const d=Math.hypot(x-SITES.fountain.x,z-SITES.fountain.z)
  if(d<DRAFT_FOUNTAIN.plazaRadius)return fountainGroundHeight(x,z)
  return 0
}
