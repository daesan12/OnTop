import {describe,it,expect} from 'vitest'
import {Vector3,Box3,Raycaster} from 'three'
import {SITES,NODES,EDGES,site,heightAt,DOCK_SCALE,LAKE,BRIDGE,STATION_SCALE,BALLOON_SCALE,RENTAL_PAIR_SPACING} from '../../src/park-renewal/plan'
import {originalFitnessTrees} from '../../src/park-renewal/PreservedFitness'
import {preservedFountainBenches} from '../../src/park-renewal/PreservedDistricts'
import {existingTreeModel} from '../../src/layout-preview/existingTreeModel'
import {trunks,crowns} from '../../src/layout-preview/sceneGeometry'
import {SITES as ORIGINAL,DRAFT_FOUNTAIN,DRAFT_FITNESS_AREA,DRAFT_FITNESS_STATIONS} from '../../src/layout-preview/layout'
import {FOUNTAIN_GARDENS} from '../../src/config/plazaGarden'
import {FOUNTAIN} from '../../src/config/parkPlan'
import {PARK_DATA} from '../../src/map/park'
import {factory} from '../../src/park-renewal/assetFactories'
import {SHOOTING_SIZE,fitApprovedObject} from '../../src/park-renewal/assetSizing'
import {forestTrailMeshes,benches,lamps,treeCount} from '../../src/park-renewal/landscape'
import {FOREST_TRAILS} from '../../src/park-renewal/landscapePlan'
import {distanceToSegment} from '../../src/park-renewal/plan'
describe('220m 공원 원본 보존과 실제 에셋 검증',()=>{
 it('확대한 열기구 안에 원본 4명 탑승 앵커와 보행 여유가 있음',()=>{
  const g=factory('balloon',{scale:BALLOON_SCALE});g.updateMatrixWorld(true)
  expect(g.userData.cabin.capacity).toBe(4)
  const slots=[1,2,3,4].map(i=>g.getObjectByName('passenger-slot-'+i)!.getWorldPosition(new Vector3()))
  for(let i=0;i<4;i++){expect(Math.hypot(slots[i]!.x,slots[i]!.z)+.38).toBeLessThan(1.7*BALLOON_SCALE);for(let j=i+1;j<4;j++)expect(slots[i]!.distanceTo(slots[j]!)).toBeGreaterThan(.8)}
  expect(new Box3().setFromObject(g).getSize(new Vector3()).y).toBeGreaterThan(17)
 })
 it('낚시터는 승인된 목재 낚시 데크를 사용하고 접안 크기를 확보',()=>{
  const deck=factory('fishing-deck'),size=new Box3().setFromObject(deck).getSize(new Vector3())
  expect(deck.name).toBe('approved-fishing-deck');expect(size.x).toBeGreaterThan(9.5);expect(size.z).toBeGreaterThan(5.8)
 })
 it('운동마당 장비·나무 벤치 중심의 나무 배치를 원본 그대로 사용',()=>{
  expect(DRAFT_FITNESS_AREA).toMatchObject({width:30,depth:22});expect(DRAFT_FITNESS_STATIONS.length).toBeGreaterThan(5)
  expect(originalFitnessTrees).toEqual(existingTreeModel(trunks,crowns).plantings.filter(p=>Math.hypot(p.position[0]-ORIGINAL.fitness.x,p.position[2]-ORIGINAL.fitness.z)<23))
  expect(originalFitnessTrees.length).toBeGreaterThan(8)
 })
 it('기존 분수 배율과 4개 원본 벤치의 좌표·방향·종류를 보존',()=>{
  expect(DRAFT_FOUNTAIN.scale).toBe(1.22);expect(preservedFountainBenches).toHaveLength(4)
  expect(preservedFountainBenches).toEqual(PARK_DATA.interactions.benches.filter(b=>b.siteId.startsWith('bench-fountain-')))
 })
 it('새 공용 도로가 확대된 원본 분수 화단 몸체와 겹치지 않음',()=>{
  const f=site('fountain'),scale=DRAFT_FOUNTAIN.scale,planters=FOUNTAIN_GARDENS.map(g=>({x:f.x+(g.x-FOUNTAIN.x)*scale,z:f.z+(g.z-FOUNTAIN.z)*scale,yaw:g.yaw}))
  for(const[a,b,w]of EDGES){const p=NODES[a]!,q=NODES[b]!;for(let t=0;t<=1;t+=.025)for(const g of planters){const dx=p[0]+(q[0]-p[0])*t-g.x,dz=p[1]+(q[1]-p[1])*t-g.z,c=Math.cos(g.yaw),s=Math.sin(g.yaw),d=Math.hypot(Math.max(0,Math.abs(dx*c-dz*s)-1.9*scale),Math.max(0,Math.abs(dx*s+dz*c)-.7*scale));expect(d,`${a}→${b}`).toBeGreaterThan(w/2+.15)}}
 })
 it('민속놀이 건물을 실제 사격장 외곽과 같은 크기로 맞춤',()=>{
  const range=factory('shooting',{plain:true}),folk=fitApprovedObject(factory('folk',{plain:true}),SHOOTING_SIZE),measure=(g:typeof folk)=>new Box3().setFromObject(g).getSize(new Vector3())
  const ref=measure(range),actual=measure(folk);expect(ref.x).toBeCloseTo(SHOOTING_SIZE[0],1);expect(actual.toArray()).toEqual(expect.arrayContaining(SHOOTING_SIZE.map(v=>expect.closeTo(v,4))))
 })
 it('모든 대여소 쌍의 두 원본 지붕은 붙여 놓아도 겹치지 않음',()=>{
  const measure=(kind:string)=>new Box3().setFromObject(factory(kind)).getSize(new Vector3()).x
  const gap=RENTAL_PAIR_SPACING-(measure('bike')+measure('scooter'))/2
  console.info('rental roof gap',gap,'forest trees',treeCount)
  expect(gap).toBeGreaterThanOrEqual(.05);expect(gap).toBeLessThan(1)
  expect(SITES.filter(s=>s.asset==='pair')).toHaveLength(8)
 })
 it('확대한 승강장의 지름과 물속 선착장 2대 접안 공간을 확보',()=>{
  const station=factory('station',{scale:STATION_SCALE}),size=new Box3().setFromObject(station).getSize(new Vector3());expect(size.x).toBeGreaterThan(30)
  const halfChannel=(3.65-.74)*DOCK_SCALE,boatHalf=1.227
  for(const x of[-2.1,2.1])expect(Math.abs(x)+boatHalf).toBeLessThan(halfChannel)
  expect(site('dock').z-3.7+2.097).toBeLessThan(site('dock').z-1.2*DOCK_SCALE)
 })
 it('실제 다리 밑면 메시도 배의 머리와 차양 위 공간을 비움',()=>{
  const bridge=factory('bridge');bridge.updateMatrixWorld(true)
  for(const x of[42.5,44,45.5]){const hit=new Raycaster(new Vector3(x,LAKE.y,BRIDGE.z),new Vector3(0,1,0)).intersectObject(bridge,true)[0];expect(hit).toBeDefined();expect(hit!.point.y).toBeGreaterThan(LAKE.y+.08+2.62+.5)}
 })
 it('추가 벤치는 숲길 옆 잔디에 있고 가로등을 붙임',()=>{
  expect(forestTrailMeshes.filter(t=>!t.id.includes('rest-bay'))).toHaveLength(2);expect(forestTrailMeshes.filter(t=>t.id.includes('rest-bay'))).toHaveLength(2);expect(benches.length).toBeGreaterThanOrEqual(2)
  for(const b of benches.filter(b=>b.point[1]!==49.5)){expect(FOREST_TRAILS.some(t=>distanceToSegment(...b.point,t.points[0]!,t.points[1]!)>t.width/2&&distanceToSegment(...b.point,t.points[0]!,t.points[1]!)<t.width/2+2)).toBe(true);expect(lamps.some(p=>Math.hypot(p[0]-b.point[0],p[1]-b.point[1])<2.1)).toBe(true);expect(Number.isFinite(heightAt(...b.point))).toBe(true)}
 })
})
