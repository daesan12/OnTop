import {groundSurfaceHeight} from '../../src/park-renewal/groundSurface'
import {it,expect} from 'vitest'
import {DoubleSide,Mesh,MeshBasicMaterial,Raycaster,Vector3} from 'three'
import {site,LAKE,ENTRANCE_PATHS,onRoad,heightAt,distanceToSegment} from '../../src/park-renewal/plan'
import {lakeBank} from '../../src/park-renewal/shoreGeometry'
import {parkGround} from '../../src/park-renewal/groundGeometry'
import {curbPaths} from '../../src/park-renewal/curbGeometry'
import {jumpFenceSections,jumpFenceOpening} from '../../src/park-renewal/jumpFencePlan'
import {JUMP_PADS,JUMP_START} from '../../src/park-renewal/jump10Plan'
import {guardPosts,guardRuns} from '../../src/park-renewal/guardLayout'
import {isPlantingGround} from '../../src/park-renewal/groundPlan'
import {inSummit} from '../../src/park-renewal/hybridTerrainPlan'
const mat=new MeshBasicMaterial({side:DoubleSide}),ground=new Mesh(parkGround.grass,mat),paved=new Mesh(parkGround.paving,mat);ground.updateMatrixWorld();paved.updateMatrixWorld()
it('호숫가 수면 경계의 높낮이 요철을 평탄화하되 공용 돌길은 유지',()=>{for(let a=3.25;a<3.85;a+=.02){const x=LAKE.x+Math.cos(a)*(LAKE.rx+.002),z=LAKE.z+Math.sin(a)*(LAKE.rz+.002);if(!onRoad(x,z,.02))expect(heightAt(x,z)).toBeCloseTo(4,2)}})
it('호숫가 측면은 전체 원주에서 실제 지형부터 수면 아래까지 이어짐',()=>{const p=lakeBank.getAttribute('position');expect(p.count).toBe(1442);for(let i=0;i<p.count;i+=2){expect(p.getY(i)).toBeCloseTo(groundSurfaceHeight(p.getX(i),p.getZ(i))+.01,2);expect(p.getY(i+1)).toBeLessThan(LAKE.y-.2)}expect(p.getX(0)).toBeCloseTo(p.getX(p.count-2));expect(p.getZ(0)).toBeCloseTo(p.getZ(p.count-2))})
it('시작 발판과 비석·비석 앞 접근로에는 울타리가 없음',()=>{const pad=JUMP_PADS[0]!,stele=site('stele');for(const r of jumpFenceSections){const x=(r.a[0]+r.z[0])/2,z=(r.a[1]+r.z[1])/2;expect(jumpFenceOpening(x,z)).toBe(false);expect(Math.abs(x-pad.x)<pad.halfX+.75&&Math.abs(z-pad.z)<pad.halfZ+.75).toBe(false);expect(Math.hypot(x-stele.x,z-stele.z)).toBeGreaterThan(3.7);expect(Math.hypot(x-JUMP_START.x,z-JUMP_START.z)).toBeGreaterThan(2.9)}})
it('길 위에 따로 남던 작은 경계석 조각은 제거',()=>{for(const p of curbPaths)expect(p.slice(1).reduce((sum,v,i)=>sum+Math.hypot(v[0]-p[i]![0],v[2]-p[i]![2]),0)).toBeGreaterThan(.85)})
it('운세방 실제 입구 정면 축으로 포장이 끊김 없이 연결',()=>{const s=site('fortune'),p=ENTRANCE_PATHS.find(p=>p.id==='fortune')!,a=[p.a[0]-s.x,p.a[1]-s.z],b=[p.b[0]-s.x,p.b[1]-s.z];expect(Math.abs(a[0]!*b[1]!-a[1]!*b[0]!)).toBeLessThan(.001);for(let t=0;t<=1;t+=.025){const x=p.a[0]+(p.b[0]-p.a[0])*t,z=p.a[1]+(p.b[1]-p.a[1])*t;expect(isPlantingGround(x,z)).toBe(false);expect(new Raycaster(new Vector3(x,20,z),new Vector3(0,-1,0)).intersectObject(paved).length).toBeGreaterThan(0)}})
it('소리함은 팔각정 쪽으로 이동하고 보드는 3도만 회전',()=>{const a=site('ranking'),b=site('mailbox');expect(a.yaw!-Math.atan2(-a.x,58-a.z)).toBeCloseTo(Math.PI/60);expect(Math.hypot(b.x,b.z-site('pavilion').z)).toBeLessThan(26);for(const s of[a,b]){expect(isPlantingGround(s.x,s.z)).toBe(true);expect(onRoad(s.x,s.z)).toBe(false)}})
it('오르막 난간은 보도블럭 바로 뒤에 있고 지주가 실제 잔디 지면에 닿음',()=>{const curves=curbPaths.flatMap(p=>p.slice(1).map((b,i)=>({a:p[i]!,b})));for(const run of guardRuns)for(let i=0;i<run.length;i+=5){const p=run[i]!;if(inSummit(p[0],p[2]))continue;const nearest=Math.min(...curves.map(c=>distanceToSegment(p[0],p[2],[c.a[0],c.a[2]],[c.b[0],c.b[2]])));expect(nearest,JSON.stringify(p)).toBeLessThan(.56)}let checked=0;for(const p of guardPosts.filter(p=>p[0]!> -88&&p[0]!< -60&&p[2]!> -78&&p[2]!< -35).filter((_,i)=>i%3===0)){const hit=new Raycaster(new Vector3(p[0]!,30,p[2]!),new Vector3(0,-1,0)).intersectObject(ground)[0];if(!hit)continue;expect(Math.abs(p[1]!-.11-hit.point.y)).toBeLessThan(.14);checked++}expect(checked).toBeGreaterThan(8)})
