import test from 'node:test'
import assert from 'node:assert/strict'
import {clearMotionSegment,insideMovementBoundary,fitnessFenceSegments} from '../../src/park-renewal/motionPlan.ts'
import {site,PARK,parkRadius,LAKE,BRIDGE,BOAT_ROUTE,bridgeDeckHeight,onFishingDeck} from '../../src/park-renewal/plan.ts'
import {boatPose} from '../../src/park-renewal/assetSizing.ts'
import {GATE} from '../../src/park-renewal/boundaryPlan.ts'
test('경계는 땅·도약·공중 모든 고도에서 걸음·탈것의 큰 이동도 차단',()=>{
 for(let i=0;i<180;i++){const a=i/180*Math.PI*2,r=parkRadius(a),x=PARK.rx*r*Math.cos(a),z=PARK.rz*r*Math.sin(a);for(const y of[4,12,60,200]){assert.equal(insideMovementBoundary(x*1.04,z*1.04,y),false);assert.equal(clearMotionSegment([x*.94,z*.94],[x*1.08,z*1.08],y,{air:true,water:true}),false)}}
})
test('운동마당은 사방 출입구로 통과하고 울타리를 유지',()=>{
 const s=site('fitness');assert.ok(fitnessFenceSegments().length>55)
 assert.ok(clearMotionSegment([s.x,s.z+10],[s.x,s.z+15],4));assert.ok(clearMotionSegment([s.x+14,s.z],[s.x+19,s.z],4))
})

test('정문 개구부도 지상과 공중에서 공원 밖으로 통과할 수 없음',()=>{
 const nx=Math.sin(GATE.yaw),nz=Math.cos(GATE.yaw)
 for(const y of[4,6,12,60,200])assert.equal(clearMotionSegment([GATE.x-nx*4,GATE.z-nz*4],[GATE.x+nx*2,GATE.z+nz*2],y,{air:true,water:true}),false)
})
test('오리배의 −Z 머리 방향과 매 순간 속도 방향이 일치',()=>{
 for(let i=0;i<360;i++){const p=boatPose(i*Math.PI/180,BOAT_ROUTE.x,BOAT_ROUTE.z,BOAT_ROUTE.rx,BOAT_ROUTE.rz),fx=-Math.sin(p.yaw),fz=-Math.cos(p.yaw);assert.ok((fx*p.dx+fz*p.dz)/Math.hypot(p.dx,p.dz)>.99999)}
})
test('오리배의 회전된 선체 상단도 다리 밑과 교각 사이를 통과',()=>{
 let minimum=Infinity,count=0
 for(let i=0;i<1440;i++){const p=boatPose(i/1440*Math.PI*2,BOAT_ROUTE.x,BOAT_ROUTE.z,BOAT_ROUTE.rx,BOAT_ROUTE.rz);if(p.x>BRIDGE.x1||Math.abs(p.z-BRIDGE.z)>4.2)continue
  const halfX=Math.abs(Math.cos(p.yaw))*1.227+Math.abs(Math.sin(p.yaw))*2.369;minimum=Math.min(minimum,bridgeDeckHeight(p.x-halfX)-.55-LAKE.y-.08-2.62,bridgeDeckHeight(p.x+halfX)-.55-LAKE.y-.08-2.62);count++
  for(const pier of BRIDGE.pierX)assert.ok(Math.abs(p.x-pier)>halfX+.4)
 }
 assert.ok(count>0);assert.ok(minimum>.5,`${minimum}m`)
})
test('새 수변 데크와 섬에 회전된 오리배 선체가 닿지 않음',()=>{
 for(let i=0;i<1440;i++){const p=boatPose(i/1440*Math.PI*2,BOAT_ROUTE.x,BOAT_ROUTE.z,BOAT_ROUTE.rx,BOAT_ROUTE.rz);for(const x of[-1.227,0,1.227])for(const z of[-2.369,0,2.369]){const xx=p.x+Math.cos(p.yaw)*x+Math.sin(p.yaw)*z,zz=p.z-Math.sin(p.yaw)*x+Math.cos(p.yaw)*z;assert.equal(onFishingDeck(xx,zz,.25),false);assert.ok(((xx-LAKE.island.x)/LAKE.island.rx)**2+((zz-LAKE.island.z)/LAKE.island.rz)**2>1)}}
})
