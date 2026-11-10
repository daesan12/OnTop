import {it,expect} from 'vitest'
import {Box3,Vector3} from 'three'
import {factory} from '../../src/park-renewal/assetFactories'
import {groundObject} from '../../src/park-renewal/assetSizing'
import {SITES,site,heightAt,facilityGroundY,insidePark,BRIDGE,bridgeDeckHeight,FISHING_SHOP,DOCK_ACCESS,FISHING_ACCESS,accessTopAt} from '../../src/park-renewal/plan'
import {isPlantingGround,FLOOR_Y_OFFSET} from '../../src/park-renewal/groundPlan'
import {treePositions,treeCount} from '../../src/park-renewal/landscape'

it('대여소·탈것·낚시점·승강장 로컬 인스턴스의 실제 최저점을 지면에 맞춤',()=>{
 for(const kind of['bike','scooter','ebike','kickboard','fishing-shop','station','sub']){
  const g=groundObject(factory(kind)),box=new Box3().setFromObject(g)
  expect(box.min.y,kind).toBeCloseTo(0,5);expect(box.getSize(new Vector3()).y,kind).toBeGreaterThan(.5)
 }
})
it('지형을 완만하게 바꾼 뒤에도 시설과 대여소의 매핑 원점은 원래 높이에 접지',()=>{
 // Full roof rectangles include elevated stairs and deliberately graded woodland.
 // Grounding the entire rectangle would flatten adjacent public roads; check the
 // immutable facility footings while route/collider tests cover actual movement.
 for(const s of SITES.filter(s=>s.radius&&!s.kind&&!['plaza','fishing','dock','stele'].includes(s.id))){
  expect(Math.abs(heightAt(s.x,s.z)-facilityGroundY(s)),s.id).toBeLessThan(.04)
  expect(insidePark(s.x,s.z,.2),s.id).toBe(true)
 }
})
it('다리 양 끝과 단일 나무 진입로의 육지 끝은 도로 높이에 맞음',()=>{
 expect(bridgeDeckHeight(BRIDGE.x0)).toBeCloseTo(heightAt(BRIDGE.x0,BRIDGE.z)+FLOOR_Y_OFFSET,5)
 expect(bridgeDeckHeight(BRIDGE.x1)).toBeCloseTo(heightAt(BRIDGE.x1,BRIDGE.z)+FLOOR_Y_OFFSET,5)
 for(const a of[DOCK_ACCESS,FISHING_ACCESS])expect(accessTopAt(a,...a.points[0]!)).toBeCloseTo(4+FLOOR_Y_OFFSET,5)
 // Timber deck support, not a 4.2m dirt pad underneath the two-storey shop.
 for(const x of[-3.5,0,3.5])for(const z of[-3.5,0,3.5])expect(heightAt(FISHING_SHOP.x+x,FISHING_SHOP.z+z)).toBeGreaterThanOrEqual(4)
})
it('새 점프 정원과 빈 숲을 확보하며 추가 수목 뿌리가 담장 안에 있음',()=>{
 expect(treeCount).toBeGreaterThan(70)
 for(const [x,z]of treePositions){expect(insidePark(x,z,2)).toBe(true);expect(isPlantingGround(x,z)).toBe(true);expect(Math.hypot(x-site('jump').x,z-site('jump').z)).toBeGreaterThan(14)}
})
