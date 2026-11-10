import {it,expect} from 'vitest'
import {Group,Mesh,MeshBasicMaterial,DoubleSide,Raycaster,Vector3} from 'three'
import {JUMP_PADS as originalPads,JUMP_GATES as originalGates} from '../../src/layout-preview/jumpCourse'
import {JUMP_PADS,JUMP_GATES,DEV_JUMP_TRANSLATION} from '../../src/park-renewal/jump10Plan'
import {site,SITES,NODES,EDGES,footprintDistance,onRoad,MONUMENT_STAIRS,heightAt,forestHeightAt,FISHING_SHOP,FISHING_NOTICE,DOCK_ACCESS,DOCK_SCALE} from '../../src/park-renewal/plan'
import {fitnessFenceSegments,clearMotionSegment} from '../../src/park-renewal/motionPlan'
import {isPlantingGround} from '../../src/park-renewal/groundPlan'
import {plantings,benches,lamps} from '../../src/park-renewal/landscape'
import {onSummitEdge} from '../../src/park-renewal/hybridTerrainPlan'
import {parkGround} from '../../src/park-renewal/groundGeometry'
import {longStairs} from '../../src/park-renewal/PreservedDistricts'
import {TOWER_TOP} from '../../src/park-renewal/towerFurniturePlan'

it('서비스가 사용하는 원본 1~6단계의 모든 좌표 차이·높이·크기·회전을 보존',()=>{
 const source=[...originalPads,...originalGates].filter(p=>p.stage<6),copy=[...JUMP_PADS,...JUMP_GATES].filter(p=>p.stage<6)
 expect(source).toHaveLength(99);expect(copy).toHaveLength(99)
 for(const p of source){const q=copy.find(q=>q.sourceId===p.id)!;expect(q).toBeDefined();expect(q.x-p.x).toBeCloseTo(DEV_JUMP_TRANSLATION.x,8);expect(q.z-p.z).toBeCloseTo(DEV_JUMP_TRANSLATION.z,8);expect(q.height-p.height).toBeCloseTo(DEV_JUMP_TRANSLATION.y,8);expect([q.halfX,q.halfZ,q.radius,q.yaw,q.gate]).toEqual([p.halfX,p.halfZ,p.radius,p.yaw,p.gate]);expect(q.collisionYaw).toBe(0)}
})
it('공용 길 전체 폭이 건물 지붕과 대여소를 뚫고 지나가지 않음',()=>{
 const skip=['plaza','fitness','fountain','lake','pavilion','pagoda','jump','island-pavilion','fishing','dock']
 for(const s of SITES.filter(s=>!s.kind&&s.radius&&!skip.includes(s.id)))for(const[a,b,width]of EDGES){const p=NODES[a]!,q=NODES[b]!,n=Math.ceil(Math.hypot(p[0]-q[0],p[1]-q[1])*4);for(let i=0;i<=n;i++){const t=i/n;expect(footprintDistance(s,p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t)-width/2,`${s.id}: ${a} -> ${b}`).toBeGreaterThanOrEqual(.1)}}
})
it('운동마당 울타리의 양 끝과 중간이 모두 잔디 안에 있고 사방 통로는 열림',()=>{
 for(const {a,z}of fitnessFenceSegments())for(const t of[0,.25,.5,.75,1])expect(isPlantingGround(a[0]+(z[0]-a[0])*t,a[1]+(z[1]-a[1])*t),`${a} -> ${z}`).toBe(true)
 const s=site('fitness');for(const [dx,dz]of[[1,0],[-1,0],[0,1],[0,-1]])expect(clearMotionSegment([s.x+dx!*18,s.z+dz!*14],[s.x,s.z],4)).toBe(true)
})
it('메인 정자 둘레 포장은 이어지고 소리함은 랭킹 오른편의 같은 잔디에 있음',()=>{
 const a=site('ranking'),b=site('mailbox');expect(b.x).toBeGreaterThan(a.x);expect(Math.hypot(a.x-b.x,a.z-b.z)).toBeLessThan(8)
 expect(isPlantingGround(a.x,a.z)).toBe(true);expect(isPlantingGround(b.x,b.z)).toBe(true)
 for(const p of[[-12,12],[12,12],[0,19],[0,22],[0,25]]as const)expect(isPlantingGround(p[0],p[1]),p.toString()).toBe(false)
})
it('수목의 수관이 건물·정상 옹벽에 들어가지 않고 분수 둘레 숲을 확보',()=>{
 const f=site('fountain');let grove=0
 for(const p of plantings){const[x,,z]=p.position,crown=(p.kind==='cone'?1.2:p.kind==='slender'?1.5:3.2)*p.scale;expect(onSummitEdge(x,z,crown+.55)).toBe(false);for(const s of SITES.filter(s=>!s.kind&&s.radius))expect(footprintDistance(s,x,z),`${s.id}: tree ${x},${z}`).toBeGreaterThan(crown+.7);const d=Math.hypot(x-f.x,z-f.z);if(d>20&&d<27)grove++}
 expect(grove).toBeGreaterThan(10)
 for(const b of benches)for(const dx of[-1.8,1.8])for(const dz of[-.7,.7]){const x=b.point[0]+dx*Math.cos(b.yaw)+dz*Math.sin(b.yaw),z=b.point[1]-dx*Math.sin(b.yaw)+dz*Math.cos(b.yaw);expect(isPlantingGround(x,z),`bench corner ${x},${z}`).toBe(true);expect(onRoad(x,z,.1),`bench corner ${x},${z}`).toBe(false)}
 for(const[x,z]of lamps){expect(isPlantingGround(x,z)).toBe(true);expect(onRoad(x,z,.5)).toBe(false)}
})
it('정상 계단 양쪽과 오름길 입구를 지면 메시로 빈틈 없이 연결',()=>{
 const g=new Group(),m=new MeshBasicMaterial({side:DoubleSide});for(const art of Object.values(longStairs)){const mesh=new Mesh(art,m);mesh.position.set(0,MONUMENT_STAIRS.bottom,MONUMENT_STAIRS.zTop);g.add(mesh)}g.add(new Mesh(parkGround.grass,m),new Mesh(parkGround.paving,m),new Mesh(parkGround.retaining,m));g.updateMatrixWorld(true)
 for(const x of[-2,0,2])for(const dz of[-.35,-.1,.15]){const hit=new Raycaster(new Vector3(x,30,MONUMENT_STAIRS.zTop+dz),new Vector3(0,-1,0)).intersectObject(g,true)[0];expect(hit).toBeDefined();expect(hit!.point.y).toBeGreaterThan(21.6)}
 for(const z of[-61,-59,-57,-55])expect(Math.abs(heightAt(-57.999,z)-forestHeightAt(-58.001,z))).toBeLessThan(.03)
 expect(clearMotionSegment([0,-50],[0,-46],22)).toBe(true)
 for(const[a,b]of EDGES){const p=NODES[a]!,q=NODES[b]!,n=Math.ceil(Math.hypot(p[0]-q[0],p[1]-q[1]));for(let i=0;i<n;i++){const t=i/n,u=(i+1)/n,x=p[0]+(q[0]-p[0])*t,z=p[1]+(q[1]-p[1])*t,y=heightAt(x,z);if(y>8)expect(clearMotionSegment([x,z],[p[0]+(q[0]-p[0])*u,p[1]+(q[1]-p[1])*u],y+.2),a+' -> '+b+' @ '+x+','+z).toBe(true)}}
},15000)
it('전망대 계단 접근을 비우고 선착장 옆 출입구와 낚시점 정면을 길로 연결',()=>{
 for(const[,z]of TOWER_TOP.telescopes)expect(z).toBeLessThan(-4)
 const dock=site('dock'),end=DOCK_ACCESS.points.at(-1)!;expect((end[1]-dock.z)/DOCK_SCALE).toBeCloseTo(1.65,5);expect(Math.abs((end[0]-dock.x)/DOCK_SCALE+4.275)).toBeLessThan(.06)
 expect(onRoad(FISHING_NOTICE.x,FISHING_NOTICE.z,1.7)).toBe(false);expect(isPlantingGround(FISHING_NOTICE.x,FISHING_NOTICE.z)).toBe(true)
 expect(Math.sin(FISHING_SHOP.yaw)).toBeGreaterThan(.9);expect(Math.cos(FISHING_SHOP.yaw)).toBeCloseTo(0);expect(NODES.fishing![0]).toBeGreaterThan(FISHING_SHOP.x)
})
