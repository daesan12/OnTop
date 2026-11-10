import {it,expect} from 'vitest'
import {Group,Mesh,MeshBasicMaterial,DoubleSide,Raycaster,Vector3} from 'three'
import {factory} from '../../src/park-renewal/assetFactories'
import {FISHING_DECK,FISHING_UPPER,FISHING_STAIRS,FISHING_ACCESS,FISHING_SHOP,FISHING_OUTLINE,TABLES,site,BRIDGE,NODES,deckHeightAt,distanceToSegment} from '../../src/park-renewal/plan'
import {parkWalkSurface} from '../../src/park-renewal/surfaceHeight'
import {clearMotionSegment} from '../../src/park-renewal/motionPlan'
import {parkGround} from '../../src/park-renewal/groundGeometry'
import {isPlantingGround,polygonArea} from '../../src/park-renewal/groundPlan'
import {inPolygon} from '../../src/park-renewal/roundedFootprint'
import {wall,piers} from '../../src/park-renewal/ParkBoundary'
import {GATE,BOUNDARY_LENGTH,boundaryAtDistance} from '../../src/park-renewal/boundaryPlan'

it('둥근 비정형 낚시터는 기존 180㎡보다 작고 실제 1층·2층·목재계단 바닥이 이어짐',()=>{
 expect(polygonArea(FISHING_OUTLINE)).toBeLessThan(180)
 const g=new Group();g.add(factory('fishing-deck'),factory('lake-access'));g.updateMatrixWorld(true)
 const hit=(x:number,z:number,y:number)=>new Raycaster(new Vector3(x,y+.05,z),new Vector3(0,-1,0),0,.11).intersectObject(g,true)
 for(const p of [[81,-39],[86,-45],[FISHING_SHOP.x,FISHING_SHOP.z]])expect(hit(p[0]!,p[1]!,FISHING_DECK.top).length).toBeGreaterThan(0)
 for(const x of[-2,0,2])for(const z of[-2,0,2]){const px=FISHING_SHOP.x+x,pz=FISHING_SHOP.z+z;expect(inPolygon(px,pz,FISHING_UPPER.outline)).toBe(true);expect(hit(px,pz,FISHING_UPPER.top).length).toBeGreaterThan(0)}
 const s=FISHING_STAIRS;let previous:[number,number]=[s.x,s.zBottom+.15],y=FISHING_DECK.top
 for(let i=0;i<=120;i++){const p:[number,number]=[s.x,s.zBottom-(s.zBottom-s.zTop)*i/120];expect(clearMotionSegment(previous,p,y)).toBe(true);const next=parkWalkSurface(...p,y);expect(next-y).toBeLessThanOrEqual(.18);expect(hit(...p,next).length).toBeGreaterThan(0);previous=p;y=next}
 expect(y).toBeCloseTo(FISHING_UPPER.top,4)
 expect(parkWalkSurface(s.x,s.zTop-.15,y)).toBe(FISHING_UPPER.top)
 expect(deckHeightAt(81,-45,4.28)).toBe(FISHING_DECK.top);expect(deckHeightAt(81,-45,7.5)).toBe(FISHING_UPPER.top)
 for(let i=0;i<=25;i++){const a=FISHING_ACCESS.points[0]!,b=FISHING_ACCESS.points[1]!,x=a[0]+(b[0]-a[0])*i/25,z=a[1]+(b[1]-a[1])*i/25;expect(hit(x,z,deckHeightAt(x,z)!).length).toBeGreaterThan(0)}
})
it('호수 다리는 6m 길의 바깥에서 시작하고 중앙에는 2좌석 테이블 여섯 개의 여유를 확보',()=>{
 expect(BRIDGE.x0-(NODES['bridge-bank']![0]+3)).toBeCloseTo(.2)
 expect(TABLES).toHaveLength(6)
 for(const a of TABLES)for(const b of TABLES)if(a!==b)expect(Math.hypot(a[0]-b[0],a[1]-b[1])).toBeGreaterThan(6)
 const stone=new Mesh(parkGround.paving,new MeshBasicMaterial({side:DoubleSide}));stone.updateMatrixWorld(true)
 for(const x of[24,26,28,29.4])expect(new Raycaster(new Vector3(x,10,BRIDGE.z),new Vector3(0,-1,0)).intersectObject(stone).length).toBeGreaterThan(0)
})
it('소리함·랭킹은 각자 광장 입구를 향해 나란히 잔디 위에 서고 안내 길이 테이블을 피함',()=>{
 const a=site('ranking'),b=site('mailbox'),yaw=Math.atan2(-a.x,58-a.z);expect(a.yaw).toBeCloseTo(yaw+Math.PI/60);expect(b.yaw).toBeCloseTo(Math.atan2(-b.x,58-b.z));expect(Math.abs(b.yaw!-a.yaw!)).toBeGreaterThan(.05);expect(Math.abs((b.x-a.x)*Math.sin(yaw)+(b.z-a.z)*Math.cos(yaw))).toBeLessThan(1.1)
 for(const s of[a,b])expect(isPlantingGround(s.x,s.z)).toBe(true)
 for(const p of TABLES)expect(distanceToSegment(...p,[0,38],NODES.rankingFront!)).toBeGreaterThan(2.4)
})
it('외곽 돌기둥의 실제 모서리 위를 기와가 덮고 돌이 지붕을 뚫고 나오지 않음',()=>{
 const roof=new Mesh(wall.clay,new MeshBasicMaterial({side:DoubleSide})),stone=new Mesh(piers.stone!,new MeshBasicMaterial({side:DoubleSide}));roof.updateMatrixWorld(true);stone.updateMatrixWorld(true)
 for(let d=GATE.opening/2+1;d<BOUNDARY_LENGTH-GATE.opening/2;d+=120){const f=boundaryAtDistance(d);for(const side of[-1,1]){const p=new Vector3(f.x+f.nx*.42*side,f.y+6,f.z+f.nz*.42*side),ray=new Raycaster(p,new Vector3(0,-1,0)),top=ray.intersectObject(roof)[0],cap=ray.intersectObject(stone)[0];expect(top).toBeDefined();expect(cap).toBeDefined();expect(top!.point.y-cap!.point.y).toBeGreaterThan(.05)}}
})
