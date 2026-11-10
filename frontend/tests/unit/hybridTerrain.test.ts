import {it,expect} from 'vitest'
import {Box3,Mesh,Raycaster,Vector3} from 'three'
import {inSummit,onSummitEdge} from '../../src/park-renewal/hybridTerrainPlan'
import {summitWalls,summitPortal,summitFenceSections} from '../../src/park-renewal/summitWalls'
import {heightAt,forestHeightAt,site,SITES,onRoad,footprintDistance,TABLES,RENTAL_VEHICLE_X,STATION_SCALE,BALLOON_SCALE,PARK,parkRadius} from '../../src/park-renewal/plan'
import {isPlantingGround} from '../../src/park-renewal/groundPlan'
import {parkGround} from '../../src/park-renewal/groundGeometry'
import {treePositions} from '../../src/park-renewal/landscape'
import {factory} from '../../src/park-renewal/assetFactories'
import {parkWalkSurface} from '../../src/park-renewal/surfaceHeight'
import {clearMotionSegment} from '../../src/park-renewal/motionPlan'
import {JUMP_PADS} from '../../src/park-renewal/jump10Plan'
import {DEV_JUMP_SIX} from '../../src/park-renewal/devJumpSixSnapshot'

it('정상은 +22m로 유지하고 옹벽은 직선 수직면으로 마감',()=>{
 expect(heightAt(site('pagoda').x,site('pagoda').z)).toBe(22);expect(heightAt(site('balloon').x,site('balloon').z)).toBe(22)
 expect(summitWalls.length).toBeGreaterThan(6)
 for(const w of summitWalls){expect(w.a[0]===w.b[0]||w.a[1]===w.b[1]).toBe(true);expect(summitPortal((w.a[0]+w.b[0])/2,(w.a[1]+w.b[1])/2)).toBe(false)}
 const g=parkGround.retaining,p=g.getAttribute('position'),idx=g.getIndex()!
 for(let i=0;i<idx.count;i+=3){const ids=[idx.getX(i),idx.getX(i+1),idx.getX(i+2)];expect(ids.every(j=>Math.abs(p.getX(j)-p.getX(ids[0]!))<1e-4)||ids.every(j=>Math.abs(p.getZ(j)-p.getZ(ids[0]!))<1e-4)).toBe(true)}
})
it('계단 앞을 울타리가 가로막지 않고 옹벽 바깥은 실제로 낮은 숲',()=>{
 expect(summitFenceSections.length).toBeGreaterThan(40);expect(clearMotionSegment([0,-50],[0,-46],22)).toBe(true)
 expect(forestHeightAt(20,-48)).toBeLessThan(19);expect(heightAt(20,-48)).toBe(22)
})
it('시설과 길에서 떨어진 숲의 경사는 대부분 완만하고 절벽형 돌출이 없음',()=>{
 const slopes:number[]=[]
 for(let x=-100;x<40;x+=2.5)for(let z=-104;z<0;z+=2.5){
  if(inSummit(x,z)||onSummitEdge(x,z,2.3)||onRoad(x,z,5)||SITES.some(s=>s.radius&&footprintDistance(s,x,z)<4)||Math.abs(x)<5&&z> -55&&z< -16)continue
  slopes.push(Math.hypot((heightAt(x+.25,z)-heightAt(x-.25,z))/.5,(heightAt(x,z+.25)-heightAt(x,z-.25))/.5))
 }
 // The longer ascent leaves fewer forest-only samples at 3 m spacing.
 // Sample at 2.5 m to retain broad coverage and the same slope limits.
 slopes.sort((a,b)=>a-b);expect(slopes.length).toBeGreaterThan(350);expect(slopes[Math.floor(slopes.length*.95)]).toBeLessThan(.5);expect(slopes.at(-1)).toBeLessThan(.85)
})
it('정문을 제외한 공원 둘레에 수목이 이어지고 나무 뿌리가 길을 침범하지 않음',()=>{
 const bins=new Array(24).fill(0)
 for(const [x,z]of treePositions){expect(onRoad(x,z,.3)).toBe(false);const a=(Math.atan2(z/PARK.rz,x/PARK.rx)+Math.PI*2)%(Math.PI*2),r=parkRadius(a);if(Math.hypot(x/PARK.rx,z/PARK.rz)>r-.14)bins[Math.floor(a/Math.PI/2*24)]++}
 for(let i=0;i<24;i++)if(i!==5&&i!==6)expect(bins[i],`outer grove sector ${i}`).toBeGreaterThan(0)
})
it('열기구에 목재 탑승 바닥이 실제로 있고 보행 높이도 일치',()=>{
 const g=factory('balloon',{scale:BALLOON_SCALE});g.updateMatrixWorld(true)
 for(const x of[-1.1,0,1.1])for(const z of[-.5,.5]){const hit=new Raycaster(new Vector3(x*BALLOON_SCALE,2,z*BALLOON_SCALE),new Vector3(0,-1,0)).intersectObject(g,true)[0];expect(hit).toBeDefined();expect(hit!.point.y).toBeGreaterThanOrEqual(.424*BALLOON_SCALE)}
 expect(g.getObjectByName('solid-timber-passenger-floor')).toBeInstanceOf(Mesh)
 const b=site('balloon'),x=b.x+2.35*1.6*STATION_SCALE,y=22+.65*STATION_SCALE+.12+(.425-.37)*BALLOON_SCALE;expect(parkWalkSurface(x,b.z)).toBeCloseTo(y,5)
})
it('대여소마다 탈것 3대가 지붕 안에 들어가고 중앙 테이블은 6개',()=>{
 expect(TABLES).toHaveLength(6);expect(RENTAL_VEHICLE_X).toHaveLength(3)
 for(const x of[-18,18])for(const z of[31,38])expect(isPlantingGround(x,z)).toBe(false)
 for(const kind of['ebike','kickboard']){const size=new Box3().setFromObject(factory(kind)).getSize(new Vector3());expect(size.x).toBeLessThan(.8);expect(.85+size.x/2).toBeLessThan(1.55)}
})
it('1단계는 dev 원본의 24개 발판 크기와 높이 차를 그대로 보존',()=>{
 const pads=JUMP_PADS.filter(p=>p.stage===0);expect(pads).toHaveLength(24)
 for(let i=0;i<pads.length;i++){expect(pads[i]!.halfX).toBe(DEV_JUMP_SIX.pads[i]!.halfX);if(i)expect(pads[i]!.height-pads[i-1]!.height).toBeCloseTo(.65,6)}
})
