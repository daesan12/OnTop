import {it,expect} from 'vitest'
import {MONUMENT_STAIRS as stair,onRoad,ENTRANCE_PATHS,TOWER_ACCESS,CAFE_ENTRY_ROUTE,heightAt,distanceToSegment} from '../../src/park-renewal/plan'
import {plantings} from '../../src/park-renewal/landscape'
import {isPlantingGround} from '../../src/park-renewal/groundPlan'
import {jumpFenceRuns,jumpFenceSections,JUMP_GATE} from '../../src/park-renewal/jumpFencePlan'
import {parkGround} from '../../src/park-renewal/groundGeometry'
import {Mesh,MeshBasicMaterial,DoubleSide,Raycaster,Vector3} from 'three'
import {canTravel} from '../../src/park-renewal/travelMotion'
import {parkWalkSurface} from '../../src/park-renewal/surfaceHeight'
const paved=new Mesh(parkGround.paving,new MeshBasicMaterial({side:DoubleSide}));paved.updateMatrixWorld();const ray=new Raycaster();const hit=(x:number,z:number)=>{ray.set(new Vector3(x,80,z),new Vector3(0,-1,0));return ray.intersectObject(paved).length>0}
it('계단은 줄기와 수관까지 비움',()=>{for(const p of plantings){const [x,,z]=p.position,crown=(p.kind==='cone'?1.2:p.kind==='slender'?1.5:3.2)*p.scale;expect(Math.abs(x-stair.x)<stair.width/2+crown+.9&&z>stair.zTop-crown-1&&z<stair.zBottom+crown+1).toBe(false)}})
it('동쪽 외곽은 큰 나무도 심음',()=>{expect(plantings.filter(p=>p.position[0]>75&&p.position[2]>5&&p.position[2]<75&&p.scale>=.85).length).toBeGreaterThanOrEqual(10)})
it('요청한 여섯 문 앞에 포장이 실제로 이어짐',()=>{for(const entry of ENTRANCE_PATHS)for(const p of (entry.id==='cafe'?CAFE_ENTRY_ROUTE.slice(1).map((b,i)=>({id:entry.id,a:CAFE_ENTRY_ROUTE[i]!,b})): [entry]))for(let t=0;t<=1;t+=.025){const x=p.a[0]+(p.b[0]-p.a[0])*t,z=p.a[1]+(p.b[1]-p.a[1])*t;expect(isPlantingGround(x,z),p.id+':'+t).toBe(false);expect(hit(x,z),p.id+':mesh:'+t).toBe(true)}},20000)
it('전망대 목재 경사로까지 접속 포장과 보행 연결',()=>{for(let i=1;i<TOWER_ACCESS.points.length;i++){const a=TOWER_ACCESS.points[i-1]!,b=TOWER_ACCESS.points[i]!;for(let t=0;t<=1;t+=.04){const x=a[0]+(b[0]-a[0])*t,z=a[1]+(b[1]-a[1])*t;expect(hit(x,z)).toBe(true)}}expect(canTravel([89.5,24.2],[89.5,23.9],heightAt(96,24)+.27,'walk',Math.PI)).toBe(true);expect(parkWalkSurface(89.5,23.9,heightAt(96,24)+.27)).toBeGreaterThan(heightAt(96,24))})
it('점프맵 울타리는 잔디 경계를 따르고 남쪽 입구는 열려 있음',()=>{expect(jumpFenceSections.length).toBeGreaterThan(100);expect(jumpFenceRuns.length).toBeLessThan(4);expect(jumpFenceRuns.some(p=>Math.hypot(p[0]![0]-p.at(-1)![0],p[0]![2]-p.at(-1)![2])>5)).toBe(true);for(const run of jumpFenceRuns)for(const p of run){expect(isPlantingGround(p[0],p[2])).toBe(true);expect(onRoad(p[0],p[2])).toBe(false);expect(distanceToSegment(p[0],p[2],JUMP_GATE.a,JUMP_GATE.b)).toBeGreaterThanOrEqual(JUMP_GATE.width/2)}expect(canTravel([JUMP_GATE.a[0],JUMP_GATE.a[1]+6],JUMP_GATE.b,parkWalkSurface(...JUMP_GATE.a),'walk',Math.PI)).toBe(true)})
