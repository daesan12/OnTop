import {expect,it} from 'vitest'
import {EDGES,NODES,heightAt,distanceToSegment,type Point} from '../../src/park-renewal/plan'
import {curbPaths} from '../../src/park-renewal/curbGeometry'
import {groundSurfaceHeight} from '../../src/park-renewal/groundSurface'
import {MAPPED_GROUND_SUPPORTS} from '../../src/park-renewal/mappedGroundSupports'
import {GRADE_RIDE_ROUTES,EDGE_RIDE_ROUTES,createRide,stepRide,ridePath} from '../../src/park-renewal/rideAuditPlan'
import {parkWalkSurface} from '../../src/park-renewal/surfaceHeight'
import {canTravel} from '../../src/park-renewal/travelMotion'

it('전체 134개 길은 중앙·양쪽 가장자리에서 10cm마다 급경사와 짧은 턱이 없다',()=>{
 expect(EDGES.length).toBe(134)
 for(const[a,b,width]of EDGES){const p=NODES[a]!,q=NODES[b]!,dx=q[0]-p[0],dz=q[1]-p[1],length=Math.hypot(dx,dz),n=Math.ceil(length/.1)
  for(const lane of[-width/2+.6,0,width/2-.6]){let previous:number|undefined,slope:number|undefined
   for(let i=0;i<=n;i++){const x=p[0]+dx*i/n-dz/length*lane,z=p[1]+dz*i/n+dx/length*lane,h=heightAt(x,z)
    if(previous!==undefined){const next=(h-previous)/(length/n),where=JSON.stringify({a,b,lane,x,z,next});expect(Math.abs(next),where).toBeLessThan(Math.tan(14.5*Math.PI/180));if(slope!==undefined)expect(Math.abs(next-slope),where).toBeLessThan(.12);slope=next}previous=h
   }
  }
 }
},20000)

it('확정된 48개 바닥 받침은 기존 매핑 높이를 정확하게 보존한다',()=>{
 for(const p of MAPPED_GROUND_SUPPORTS)expect(heightAt(p.x,p.z),p.id).toBe(p.y)
})

for(const route of EDGE_RIDE_ROUTES)for(const travel of['bicycle','scooter']as const)it(`${route.name}: ${travel} 중앙과 양쪽 가장자리에서 차체 전체가 통과한다`,()=>{
 for(const reverse of[false,true])for(const lane of[-2.4,0,2.4]){
  const s=createRide(route.id,travel,parkWalkSurface,reverse,lane)
  for(let i=0;i<20000&&!s.complete&&!s.blocked;i++)stepRide(s,1/60,parkWalkSurface)
  const detail=JSON.stringify({route:route.id,travel,reverse,lane,x:s.x,z:s.z,grade:s.maxGrade,roll:s.maxRoll})
  expect(s.blocked,detail).toBe(false);expect(s.complete,detail).toBe(true)
  expect(s.maxGrade,detail).toBeLessThan(Math.tan(14.5*Math.PI/180))
  expect(s.maxRoll,detail).toBeLessThan(Math.tan(13*Math.PI/180))
 }
},25000)

it('둥근 보도블럭의 모든 연결점은 실제 렌더링된 지형 위에 닿아 있다',()=>{
 expect(curbPaths.length).toBeGreaterThan(20)
 for(const path of curbPaths)for(const[x,y,z]of path)expect(y).toBeCloseTo(groundSurfaceHeight(x,z),7)
})

it('두 전체 동선의 긴 보도블럭은 중간에서도 뜨거나 지면에 잠기지 않는다',()=>{
 const routes=GRADE_RIDE_ROUTES.map(r=>ridePath(r.id));let checked=0
 for(const path of curbPaths)for(let i=1;i<path.length;i++){
  const a=path[i-1]!,b=path[i]!,x=(a[0]+b[0])/2,z=(a[2]+b[2])/2
  if(!routes.some(p=>p.slice(1).some((q,j)=>distanceToSegment(x,z,p[j]!,q)<7)))continue
  for(const t of[.25,.5,.75]){const x=a[0]+(b[0]-a[0])*t,z=a[2]+(b[2]-a[2])*t,y=a[1]+(b[1]-a[1])*t;expect(Math.abs(y-groundSurfaceHeight(x,z)),JSON.stringify({x,z,y})).toBeLessThan(.03);checked++}
 }
 expect(checked).toBeGreaterThan(3000)
})

for(const route of GRADE_RIDE_ROUTES)it(`${route.name}: 중앙·양쪽 차선의 연결부 경사가 갑자기 반전되지 않는다`,()=>{
 for(const lane of[-1.2,0,1.2]){
  const path=ridePath(route.id,false,lane),dist=[0]
  for(let i=1;i<path.length;i++)dist.push(dist.at(-1)!+Math.hypot(path[i]![0]-path[i-1]![0],path[i]![1]-path[i-1]![1]))
  const at=(d:number)=>{let i=1;while(i<dist.length-1&&dist[i]!<d)i++;const a=path[i-1]!,b=path[i]!,t=(d-dist[i-1]!)/(dist[i]!-dist[i-1]!);return heightAt(a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t)}
  for(let d=.5;d<dist.at(-1)!-.5;d+=.1){const h=at(d),before=Math.atan((h-at(d-.5))/.5),after=Math.atan((at(d+.5)-h)/.5);expect(Math.abs(after-before)*180/Math.PI,JSON.stringify({route:route.id,lane,d})).toBeLessThan(4.5)}
 }
})

for(const route of GRADE_RIDE_ROUTES)for(const travel of['bicycle','scooter']as const)it(`${route.name}: ${travel} 양방향과 좌우 여유 차선 주행`,()=>{
 for(const reverse of[false,true])for(const lane of[-1.2,0,1.2]){const s=createRide(route.id,travel,parkWalkSurface,reverse,lane);for(let i=0;i<20000&&!s.complete&&!s.blocked;i++)stepRide(s,1/60,parkWalkSurface);const detail=JSON.stringify({route:route.id,travel,reverse,lane,x:s.x,z:s.z,grade:s.maxGrade,roll:s.maxRoll});expect(s.blocked,detail).toBe(false);expect(s.complete,detail).toBe(true);expect(s.maxGrade,detail).toBeLessThan(Math.tan(16*Math.PI/180));expect(s.maxRoll,detail).toBeLessThan(Math.tan(12*Math.PI/180))}
},25000)

for(const route of GRADE_RIDE_ROUTES)it(`${route.name}: 걷기로도 끊김 없이 왕복한다`,()=>{
 for(const reverse of[false,true]){const path=ridePath(route.id,reverse);let from:Point=path[0]!
  for(const target of path.slice(1)){const length=Math.hypot(target[0]-from[0],target[1]-from[1]),n=Math.max(1,Math.ceil(length/.2)),start=from
   for(let i=1;i<=n;i++){const to:Point=[start[0]+(target[0]-start[0])*i/n,start[1]+(target[1]-start[1])*i/n];expect(canTravel(from,to,parkWalkSurface(...from),'walk',Math.atan2(to[0]-from[0],to[1]-from[1])),JSON.stringify({route:route.id,from,to})).toBe(true);from=to}
  }
 }
},15000)
