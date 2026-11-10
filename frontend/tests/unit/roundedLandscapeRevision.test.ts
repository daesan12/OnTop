import acceptedMapping from '../../generated/park-renewal/mapping.json'
import {it,expect} from 'vitest'
import {readFileSync} from 'node:fs'
import {Group,Mesh,BoxGeometry,MeshBasicMaterial,Box3,Raycaster,Vector3,DoubleSide} from 'three'
import {site,NODES,BRIDGE,BRIDGE_LANDINGS,RENTAL_VEHICLE_X,facilityFootprint,onRoad} from '../../src/park-renewal/plan'
import {isPlantingGround} from '../../src/park-renewal/groundPlan'
import {parkGround} from '../../src/park-renewal/groundGeometry'
import {treePositions,benches,lamps} from '../../src/park-renewal/landscape'
import {lakeFenceSegments} from '../../src/park-renewal/lakePlan'
import {WEST_REST_ROW,HUB_TREE_ISLAND,REMOVED_POCKET} from '../../src/park-renewal/landscapeRefinementPlan'
import {factory} from '../../src/park-renewal/assetFactories'
import {reverseSteleArrow} from '../../src/park-renewal/steleRefinement'

it('분수·낚시터의 실제 통행 중심 폭은 포장으로 이어지고 수변 울타리가 침범하지 않음',()=>{
 const mesh=new Mesh(parkGround.paving,new MeshBasicMaterial({side:DoubleSide})),surfaces=new Group();surfaces.add(mesh,factory('lake-access'));surfaces.updateMatrixWorld(true)
 for(const [a,b]of[['southEastPlaza','fountainGate'],['fountainGate','fountainCourt'],['east-mid','fishing'],['fishing','fishingBypass'],['fishingBypass','east-north']]){
  const p=NODES[a]!,q=NODES[b]!,length=Math.hypot(q[0]-p[0],q[1]-p[1])
  for(let t=0;t<=1;t+=.04)for(const side of[-1.5,0,1.5]){const x=p[0]+(q[0]-p[0])*t-(q[1]-p[1])/length*side,z=p[1]+(q[1]-p[1])*t+(q[0]-p[0])/length*side;if(Math.hypot(x-site('fountain').x,z-site('fountain').z)<17.61)continue;expect(isPlantingGround(x,z),`${a}→${b} ${x},${z}`).toBe(false);expect(new Raycaster(new Vector3(x,50,z),new Vector3(0,-1,0)).intersectObject(surfaces,true).length,`${a}→${b} actual ${x},${z}`).toBeGreaterThan(0)}
 }
 for(const s of lakeFenceSegments())for(const t of[.05,.5,.95])expect(onRoad(s.a[0]+(s.z[0]-s.a[0])*t,s.a[1]+(s.z[1]-s.a[1])*t,.3)).toBe(false)
})
it('작은 잔디 조각을 정리하고 카페 잔디 접근 공간·타원 수목 섬을 보존',()=>{
 expect(isPlantingGround(REMOVED_POCKET.x,REMOVED_POCKET.z)).toBe(false)
 // The cafe approach is now a rounded path, rather than the old diagonal lawn.
 expect(isPlantingGround(20.5,-8)).toBe(false);expect(isPlantingGround(24,-6)).toBe(false)
 expect(isPlantingGround(HUB_TREE_ISLAND.x,HUB_TREE_ISLAND.z)).toBe(true)
 expect(treePositions.some(p=>Math.hypot(p[0]-HUB_TREE_ISLAND.x,p[1]-HUB_TREE_ISLAND.z)<2.8)).toBe(true)
 for(const l of BRIDGE_LANDINGS){expect(l.x1).toBeGreaterThan(l.x0);expect(l.x1-l.x0).toBeLessThanOrEqual(BRIDGE.width)}
 expect(BRIDGE.x0).toBeLessThan(30);expect(BRIDGE_LANDINGS[1].x1-BRIDGE.x1).toBeGreaterThan(1)
})
it('서쪽 잔디 쉼터에 벤치·가로등·3대씩의 짝 대여소가 한 줄이고 나무는 뒤에 있음',()=>{
 expect(benches.some(b=>b.point===WEST_REST_ROW.bench)).toBe(true);expect(lamps.some(p=>Math.hypot(p[0]-WEST_REST_ROW.lamp[0],p[1]-WEST_REST_ROW.lamp[1])<.001)).toBe(true)
 const s=site('mobility-rest'),f=facilityFootprint(s);expect(s.z).toBe(WEST_REST_ROW.bench[1]);expect(s.z).toBe(WEST_REST_ROW.lamp[1]);expect(RENTAL_VEHICLE_X).toHaveLength(3)
 for(const p of[WEST_REST_ROW.bench,WEST_REST_ROW.lamp,[s.x,s.z]])expect(isPlantingGround(p[0]!,p[1]!)).toBe(true)
 for(const side of[-1,1])for(const end of[-1,1])expect(isPlantingGround(s.x+side*(f.half[0]-.1),s.z+end*(f.half[1]-.1))).toBe(true)
 // Overlapping crowns were removed before the coordinate freeze. Preserve that accepted grove.
 expect(treePositions).toEqual(acceptedMapping.world.trees)
 expect(treePositions.filter(p=>p[0]>30&&p[0]<38&&p[1]>-90&&p[1]<-71).length).toBeGreaterThanOrEqual(4)
})
it('안내 비석은 접근 길을 보고 돌출 화살표만 반전하며 기존 입구 게이트는 제거',()=>{
 const s=site('stele');expect(s.node).toBe('jumpApproach');expect(NODES[s.node]![1]).toBeGreaterThan(s.z)
 const original=new Group(),arrow=new Mesh(new BoxGeometry(3,1,.1),new MeshBasicMaterial());arrow.name='stele-arrow';arrow.position.x=2;original.add(arrow);const label=new Group();label.name='stele-korean-label';original.add(label)
 const copy=original.clone(true),before=new Box3().setFromObject(copy.getObjectByName('stele-arrow')!);reverseSteleArrow(copy);const changed=copy.getObjectByName('stele-arrow')!
 expect(changed.scale.x).toBe(-1);expect(new Box3().setFromObject(changed).getCenter(new Vector3()).x).toBeCloseTo(before.getCenter(new Vector3()).x,6);expect(copy.getObjectByName('stele-korean-label')!.scale.x).toBe(1);expect(arrow.scale.x).toBe(1)
 expect(readFileSync('src/park-renewal/Scene.tsx','utf8')).not.toContain('<JumpEntrance')
})
