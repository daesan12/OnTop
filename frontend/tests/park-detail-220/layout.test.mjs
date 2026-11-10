import test from 'node:test'
import assert from 'node:assert/strict'
import {PARK,SITES,NODES,NODE_HEIGHTS,EDGES,TABLES,PLAZA_RADIUS,REST_PAVILIONS,site,parkRadius,insidePark,inLake,onBridge,routeTo,heightAt,distanceToSegment,FACILITY_APPROACHES} from '../../src/park-renewal/plan.ts'
import {FOREST_TRAILS,SIGNPOSTS} from '../../src/park-renewal/landscapePlan.ts'
test('40명용 공원의 실제 최대 폭·깊이는 각각 220m',()=>{
 const points=Array.from({length:4096},(_,i)=>{const a=i/4096*Math.PI*2,r=parkRadius(a);return[PARK.rx*r*Math.cos(a),PARK.rz*r*Math.sin(a)]})
 assert.equal(PARK.capacity,40);for(const axis of[0,1])assert.ok(Math.abs(Math.max(...points.map(p=>p[axis]))-Math.min(...points.map(p=>p[axis]))-220)<.01)
 assert.equal(TABLES.length,6);assert.ok(PLAZA_RADIUS<24);assert.equal(REST_PAVILIONS.length,4)
})
test('필수 장소와 각 주요 구역의 짝 대여소·세 확장 공간이 남아 있음',()=>{
 for(const id of['fortune','tower','fitness','fountain','plaza','pavilion','gacha','ranking','mailbox','lottery','mole','bread','pigeon','arcade','vr','folk','shooting','island-pavilion','dock','cafe','fishing','pagoda','jump','stele','balloon'])assert.ok(site(id),id)
 assert.equal(SITES.filter(s=>s.asset==='pair').length,8);assert.equal(SITES.filter(s=>s.kind==='reserve').length,3)
 for(const s of SITES){assert.ok(insidePark(s.x,s.z),s.id);assert.ok(routeTo(s.id).length>=2,s.id)}
})
test('공용 돌길의 폭 전체가 육지와 담장 안에 있음',()=>{
 for(const[a,b,w]of EDGES){const p=NODES[a],q=NODES[b],length=Math.hypot(q[0]-p[0],q[1]-p[1]),n=Math.ceil(length*2),nx=-(q[1]-p[1])/length,nz=(q[0]-p[0])/length
  for(let i=0;i<=n;i++)for(const side of[-1,0,1]){const x=p[0]+(q[0]-p[0])*i/n+nx*w/2*side,z=p[1]+(q[1]-p[1])*i/n+nz*w/2*side;assert.ok(insidePark(x,z),`${a}→${b}: 담장`);assert.equal(inLake(x,z,.2),false,`${a}→${b}: 호수`)}
 }
})
test('안내선이 테이블 의자·메인 정자 몸체·대석탑 몸체를 지나지 않음',()=>{
 for(const s of SITES){const path=routeTo(s.id);assert.deepEqual(path[0],NODES.entry,s.id)
  for(let i=1;i<path.length;i++){for(const p of TABLES)assert.ok(distanceToSegment(...p,path[i-1],path[i])>2.4,`${s.id}: 의자`)
   for(const id of['pavilion','pagoda']){const o=site(id);assert.ok(distanceToSegment(o.x,o.z,path[i-1],path[i])>(id==='pavilion'?13.5:15.8),`${s.id}: ${id}`)}
  }
 }
})
test('숲길은 돌길과 물을 침범하지 않고 건물 출입로와 별개로 놓임',()=>{
 for(const trail of FOREST_TRAILS){const[p,q]=trail.points,length=Math.hypot(q[0]-p[0],q[1]-p[1]),nx=-(q[1]-p[1])/length,nz=(q[0]-p[0])/length
  for(let t=0;t<=1;t+=.04)for(const side of[-1,0,1]){const x=p[0]+(q[0]-p[0])*t+nx*trail.width/2*side,z=p[1]+(q[1]-p[1])*t+nz*trail.width/2*side;assert.ok(insidePark(x,z,1),trail.id);assert.equal(inLake(x,z,1),false,trail.id);for(const[a,b,w]of EDGES)assert.ok(distanceToSegment(x,z,NODES[a],NODES[b])>w/2+.4,`${trail.id}: ${a}→${b}`);for(const a of FACILITY_APPROACHES)assert.ok(distanceToSegment(x,z,a.a,a.b)>a.width/2+.25,`${trail.id}: ${a.id} 입구`)}
 }
 assert.ok(SIGNPOSTS.some(s=>s.variant==='wood-arrow'));assert.ok(SIGNPOSTS.some(s=>s.variant==='crossroads'))
 for(const sign of SIGNPOSTS)assert.ok(insidePark(sign.x,sign.z)&&!inLake(sign.x,sign.z))
})
test('대석탑 정원과 열기구가 가장 높은 지면에 있고 우회로가 이어짐',()=>{
 for(const id of['pagoda','balloon'])assert.equal(heightAt(site(id).x,site(id).z),22,id)
 for(const n of['hill0','hill1','hill2','hill-loop','hill-cross','monumentW','monument','balloon'])assert.ok(Number.isFinite(heightAt(...NODES[n])))
 for(const[id,p]of Object.entries(NODES))assert.ok(Math.abs(heightAt(...p)-NODE_HEIGHTS[id])<.15,`${id}: ${heightAt(...p)}`)
})
test('확장 공간의 실제 직사각형이 경계·호수·공용 도로를 피함',()=>{
 for(const s of SITES.filter(s=>s.kind==='reserve')){const rx=s.radius,rz=s.id==='reserve-north'?10:s.id==='reserve-south'?7:9
  for(let x=-rx;x<=rx;x+=2)for(let z=-rz;z<=rz;z+=2){assert.ok(insidePark(s.x+x,s.z+z,1),s.id);assert.equal(inLake(s.x+x,s.z+z,1),false,s.id)}
  for(const[a,b,w]of EDGES){const p=NODES[a],q=NODES[b];for(let t=0;t<=1;t+=.02){const x=p[0]+(q[0]-p[0])*t,z=p[1]+(q[1]-p[1])*t,d=Math.hypot(Math.max(0,Math.abs(x-s.x)-rx),Math.max(0,Math.abs(z-s.z)-rz));assert.ok(d>w/2+.6,`${s.id}: ${a}→${b}`)}}
 }
})
