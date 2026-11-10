import test from 'node:test'
import assert from 'node:assert/strict'
import {site,NODES,EDGES,insidePark,distanceToSegment,DOCK_ACCESS,FISHING_ACCESS,deckHeightAt,accessTopAt} from '../../src/park-renewal/plan.ts'
import {isPlantingGround} from '../../src/park-renewal/groundPlan.ts'
import {clearMotionSegment,fitnessFenceSegments} from '../../src/park-renewal/motionPlan.ts'
import {hillEdgeSections} from '../../src/park-renewal/hillEdgesPlan.ts'

test('운세방과 정문 대여소를 잔디에 두고 광장 시설을 마당으로 향하고 랭킹·소리함은 각각 광장 입구를 향함',()=>{
 for(const id of['fortune','mobility-entry']){const s=site(id);assert.ok(isPlantingGround(s.x,s.z),id)}
 for(const [a,b]of[['gacha','lottery'],['ranking','mailbox']]){const p=site(a),q=site(b);assert.ok(Math.hypot(p.x-q.x,p.z-q.z)<13)}
 for(const id of['gacha','lottery','ranking']){const s=site(id),angle=Math.atan2(-s.x,(id==='ranking'?58:38)-s.z)+(id==='ranking'?Math.PI/60:0);assert.ok(Math.abs(angle-s.yaw)<1e-8,id)}
 const p=site('ranking'),q=site('mailbox');assert.ok(Math.abs(q.yaw-Math.atan2(-q.x,58-q.z))<1e-8);assert.ok(Math.abs((q.x-p.x)*Math.sin(p.yaw)+(q.z-p.z)*Math.cos(p.yaw))<1.5)
})
test('운동마당 사방 입구를 걸어서 통과하고 대각선 울타리는 유지',()=>{
 const s=site('fitness');assert.ok(fitnessFenceSegments().length>55)
 for(const side of[-1,1])assert.ok(clearMotionSegment([s.x,s.z+side*15],[s.x,s.z+side*10],4))
 assert.ok(clearMotionSegment([s.x+19,s.z],[s.x+14,s.z],4));assert.equal(clearMotionSegment([s.x+13,s.z+10],[s.x+9,s.z+7],4),false)
})
test('전망대 몸체와 담장 사이에 여유가 있고 공용 길은 몸체를 통과하지 않음',()=>{
 const s=site('tower');for(let a=0;a<Math.PI*2;a+=.03)assert.ok(insidePark(s.x+8.3*Math.cos(a),s.z+8.3*Math.sin(a),.4))
 for(const[a,b,w]of EDGES)assert.ok(distanceToSegment(s.x,s.z,NODES[a],NODES[b])>8+w/2+.2,`${a}→${b}`)
})
test('선착장과 낚시터의 나무 진입로는 끊김 없는 보행 바닥',()=>{
 for(const a of[DOCK_ACCESS,FISHING_ACCESS])for(let i=1;i<a.points.length;i++){
  const p=a.points[i-1],q=a.points[i];assert.ok(clearMotionSegment(p,q,a.top))
  for(let t=0;t<=1;t+=.04)assert.equal(deckHeightAt(p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t),accessTopAt(a,p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t))
 }
})
test('높은 길의 노출된 가장자리에 실제 이동을 막는 난간이 이어짐',()=>{
 assert.ok(hillEdgeSections.length>12)
 const s=hillEdgeSections[0],x=(s.a[0]+s.z[0])/2,z=(s.a[2]+s.z[2])/2,dx=s.z[0]-s.a[0],dz=s.z[2]-s.a[2],l=Math.hypot(dx,dz),nx=-dz/l,nz=dx/l
 assert.equal(clearMotionSegment([x+nx*.7,z+nz*.7],[x-nx*.7,z-nz*.7],s.a[1]),false)
})
