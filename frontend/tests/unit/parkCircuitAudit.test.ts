import {expect,it} from 'vitest'
import {Box3} from 'three'
import {EDGES,NODES,SITES,rentalYaw,type Point} from '../../src/park-renewal/plan'
import {PARK_RIDE_ROUTES,createRide,stepRide} from '../../src/park-renewal/rideAuditPlan'
import {parkWalkSurface} from '../../src/park-renewal/surfaceHeight'
import {canTravel,rentalBlocksTravel} from '../../src/park-renewal/travelMotion'
import {isPlantingGround,onLand} from '../../src/park-renewal/groundPlan'
import {curbPaths} from '../../src/park-renewal/curbGeometry'
import {groundSurfaceHeight,guardFloorY} from '../../src/park-renewal/groundSurface'
import {guardPosts} from '../../src/park-renewal/guardLayout'
import {factory} from '../../src/park-renewal/assetFactories'

it('134개 공용 길은 중앙과 양옆 차선에서 두 탈것의 차체가 통과한다',()=>{
 const failures:unknown[]=[]
 for(const[a,b,w]of EDGES){const p=NODES[a]!,q=NODES[b]!,dx=q[0]-p[0],dz=q[1]-p[1],len=Math.hypot(dx,dz),n=Math.ceil(len/.2)
  for(const travel of['bicycle','scooter']as const)for(const reverse of[false,true])for(const lane of[-Math.min(.8,w/2-.8),0,Math.min(.8,w/2-.8)]){
   const point=(i:number):Point=>[p[0]+dx*i/n-dz/len*lane,p[1]+dz*i/n+dx/len*lane];let from=point(reverse?n:0),h=parkWalkSurface(...from),yaw=Math.atan2(dx,dz)+(reverse?Math.PI:0)
   for(let i=1;i<=n;i++){const to=point(reverse?n-i:i);if(!canTravel(from,to,h,travel,yaw)||onLand(...to)&&isPlantingGround(...to))failures.push({a,b,travel,reverse,lane,to});h=parkWalkSurface(...to,h);from=to}
  }
 }
 expect(failures,JSON.stringify(failures.slice(0,5))).toEqual([])
},60000)

for(const r of PARK_RIDE_ROUTES)for(const travel of['bicycle','scooter']as const)it(`${r.name}: ${travel} 입구에서 출발해 양방향 순환 후 같은 입구에 돌아온다`,()=>{
 for(const reverse of[false,true]){const s=createRide(r.id,travel,parkWalkSurface,reverse);expect(s.path.every(p=>p.every(Number.isFinite))).toBe(true);for(let i=0;i<100000&&!s.complete&&!s.blocked;i++)stepRide(s,1/60,parkWalkSurface)
  const detail=JSON.stringify({id:r.id,travel,reverse,x:s.x,z:s.z,grade:s.maxGrade});expect(s.complete,detail).toBe(true);expect(s.blocked,detail).toBe(false);expect(s.x).toBeCloseTo(NODES.entry![0],6);expect(s.z).toBeCloseTo(NODES.entry![1],6);expect(s.maxGrade,detail).toBeLessThan(Math.tan(14.5*Math.PI/180));expect(s.maxRoll,detail).toBeLessThan(Math.tan(12*Math.PI/180))
 }
},30000)

it('대여소 실물과 주차된 탈것은 막고 비어 있는 입구 접근 공간은 열어 둔다',()=>{
 const s=SITES.find(s=>s.id==='mobility-entry')!,yaw=rentalYaw(s),c=Math.cos(yaw),v=Math.sin(yaw)
 for(const[kind,side]of[['bicycle',-1],['scooter',1]]as const){const box=new Box3().setFromObject(factory('rental-bay',{kind}));for(const x of[box.min.x,box.max.x])for(const z of[box.min.z,box.max.z]){const lx=x+side*1.7;expect(rentalBlocksTravel(s.x+c*lx+v*z,s.z-v*lx+c*z)).toBe(true)}}
 expect(rentalBlocksTravel(s.x,s.z)).toBe(true);expect(rentalBlocksTravel(...NODES.entryRentals!)).toBe(false)
})

it('공원 전체 보도블럭 중간 받침과 울타리 기둥은 지면에 붙어 있다',()=>{
 let count=0,worst=0,where:unknown
 for(const path of curbPaths)for(let i=1;i<path.length;i++){const a=path[i-1]!,b=path[i]!;for(const t of[.25,.5,.75]){const x=a[0]+(b[0]-a[0])*t,z=a[2]+(b[2]-a[2])*t;if(!onLand(x,z))continue;const error=Math.abs(a[1]+(b[1]-a[1])*t-groundSurfaceHeight(x,z));if(error>worst){worst=error;where={x,z,error}}count++}}
 expect(count).toBeGreaterThan(6000);expect(worst,JSON.stringify(where)).toBeLessThan(.04)
 for(const p of guardPosts)expect(p[1]).toBeCloseTo(guardFloorY(p[0]!,p[2]!),6)
})

it('보행용 호수섬 다리는 양 끝 길과 연결되고 왕복 보행을 막지 않는다',()=>{
 for(const reverse of[false,true]){let from:Point=reverse?NODES['island-entry']!:NODES['bridge-bank']!,h=parkWalkSurface(...from);const target=reverse?NODES['bridge-bank']!:NODES['island-entry']!,start=from,n=Math.ceil(Math.hypot(target[0]-from[0],target[1]-from[1])/.1)
  for(let i=1;i<=n;i++){const to:Point=[start[0]+(target[0]-start[0])*i/n,start[1]+(target[1]-start[1])*i/n];expect(canTravel(from,to,h,'walk',Math.atan2(to[0]-from[0],to[1]-from[1])),JSON.stringify({from,to,h})).toBe(true);const y=parkWalkSurface(...to,h);expect(Math.abs(y-h)).toBeLessThan(.08);h=y;from=to}
 }
})
