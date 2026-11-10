import {expect,it} from 'vitest'
import {targetFade,coursePadFade,applyJumpFadeShader} from '../../src/features/jumpmap/visibility'
import {JUMP_PADS,DEV_JUMP_TRANSLATION} from '../../src/park-renewal/jump10Plan'
import {BRIDGE,BRIDGE_LANDINGS,FISHING_UPPER,FISHING_OUTLINE,FISHING_SHOP,FISHING_STAIRS,CAFE_ENTRY_ROUTE,heightAt,type Point} from '../../src/park-renewal/plan'
import {treePositions} from '../../src/park-renewal/landscape'
import {inPolygon} from '../../src/park-renewal/roundedFootprint'
import {isPlantingGround} from '../../src/park-renewal/groundPlan'
import {parkWalkSurface} from '../../src/park-renewal/surfaceHeight'
import {canTravel} from '../../src/park-renewal/travelMotion'
import {HILL_NODE_IDS} from '../../src/park-renewal/hillRoute'
import {EDGES,NODES} from '../../src/park-renewal/plan'

it('dev와 같은 높이별 디더 표시: 시작 전 1단계는 보이고 높은 구간은 15% 표시한다',()=>{
 const first=JUMP_PADS.filter(p=>p.stage===0),later=JUMP_PADS.filter(p=>p.stage>0)
 expect(first.filter(p=>targetFade(p.height-DEV_JUMP_TRANSLATION.y,0,false,false,false)===1).length).toBeGreaterThan(5)
 expect(later.some(p=>targetFade(p.height-DEV_JUMP_TRANSLATION.y,0,false,false,false)===.15)).toBe(true)
 expect(coursePadFade(9,1,0,false,false,false)).toBe(.15)
 expect(coursePadFade(9,1,0,true,false,false)).toBe(1)
 expect(targetFade(30,29,true,false,false)).toBe(1)
 expect(targetFade(30,0,true,true,false)).toBe(.6)
 expect(targetFade(10,0,false,false,true)).toBe(.25)
 const shader={vertexShader:'#include <begin_vertex>',fragmentShader:'#include <color_fragment>'}
 applyJumpFadeShader(shader)
 expect(shader.vertexShader).toContain('aFade');expect(shader.fragmentShader).toContain('discard')
})

it('VR 앞 지정된 두 나무를 제거하고 수변 숲길은 보존한다',()=>{
 for(const[x,z]of[[-58.4,-11.6],[-68,-11.6]])expect(treePositions.some(p=>Math.hypot(p[0]-x!,p[1]-z!)<.1)).toBe(false)
 expect(isPlantingGround(78,29)).toBe(false)
 expect(isPlantingGround(72,18)).toBe(true)
 expect(treePositions.filter(([x,z])=>x>66&&x<87&&z>15&&z<26).length).toBeGreaterThan(2)
})

it('섬 팔각정 계단 전에 약 2m 평탄한 도착 공간이 있고 다리와 보행 높이가 이어진다',()=>{
 const end=BRIDGE_LANDINGS[1]
 expect(end.x1-end.x0).toBeGreaterThan(1.9);expect(end.width).toBeGreaterThan(BRIDGE.width)
 let from:Point=[BRIDGE.x1-.3,BRIDGE.z],h=parkWalkSurface(...from)
 for(let x=BRIDGE.x1-.25;x<=end.x1+.02;x+=.05){const to:Point=[x,BRIDGE.z],y=parkWalkSurface(...to,h);expect(canTravel(from,to,h,'walk',Math.PI/2)).toBe(true);expect(Math.abs(y-h)).toBeLessThan(.04);from=to;h=y}
})

it('낚시터 2층 뒤편은 돌아갈 수 있고 1층 외측 통로는 계단 옆으로 넓게 열린다',()=>{
 const rear:Point[]=[[78.6,-49.2],[78.6,-42.5],[86.5,-42.5]],lower:Point[]=[[88,-40],[86.7,-40],[87.1,-43.5]]
 for(const[points,outline]of[[rear,FISHING_UPPER.outline],[lower,FISHING_OUTLINE]]as const)for(let j=1;j<points.length;j++){
  const a=points[j-1]!,b=points[j]!,n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.1)
  for(let i=0;i<=n;i++){const x=a[0]+(b[0]-a[0])*i/n,z=a[1]+(b[1]-a[1])*i/n;expect(inPolygon(x,z,outline)).toBe(true);if(points===rear)expect(x<FISHING_SHOP.x-1.3||Math.abs(z-FISHING_SHOP.z)>1.925).toBe(true)}
 }
 expect(89.5-(FISHING_STAIRS.x+FISHING_STAIRS.width/2)).toBeGreaterThan(4)
})

it('카페의 새 곡선 진입로는 잔디에 끊기지 않고 카운터 앞까지 평탄하게 연결된다',()=>{
 for(let j=1;j<CAFE_ENTRY_ROUTE.length;j++){const a=CAFE_ENTRY_ROUTE[j-1]!,b=CAFE_ENTRY_ROUTE[j]!,length=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.ceil(length/.1);let h=heightAt(...a)
  for(let i=1;i<=n;i++){const x=a[0]+(b[0]-a[0])*i/n,z=a[1]+(b[1]-a[1])*i/n,y=heightAt(x,z);expect(isPlantingGround(x,z)).toBe(false);expect(Math.abs(y-h)/(length/n)).toBeLessThan(Math.tan(9*Math.PI/180));h=y}
 }
})

it('길어진 열기구 오르막은 중앙과 양끝 차선에서 12도 이하로 연속된다',()=>{
 let length=0
 for(const[a,b,w]of EDGES.filter(([a,b])=>HILL_NODE_IDS.includes(a as never)&&HILL_NODE_IDS.includes(b as never))){const p=NODES[a]!,q=NODES[b]!,dx=q[0]-p[0],dz=q[1]-p[1],d=Math.hypot(dx,dz),n=Math.ceil(d/.1);length+=d
  for(const lane of[-w/2+.6,0,w/2-.6]){let h:number|undefined;for(let i=0;i<=n;i++){const x=p[0]+dx*i/n-dz/d*lane,z=p[1]+dz*i/n+dx/d*lane,y=heightAt(x,z);if(h!==undefined)expect(Math.abs(y-h)/(d/n),JSON.stringify({a,b,lane,x,z})).toBeLessThan(Math.tan(12*Math.PI/180));h=y}}
 }
 expect(length).toBeGreaterThan(140)
})
