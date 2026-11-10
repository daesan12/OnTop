import {expect,it} from 'vitest'
import {createRide,stepRide,CAFE_RIDE_STOP,type RideRoute} from '../../src/park-renewal/rideAuditPlan'
import {TRAVEL_PROFILES,cafeBlocksTravel,canTravel} from '../../src/park-renewal/travelMotion'
import {parkWalkSurface} from '../../src/park-renewal/surfaceHeight'
import {isPlantingGround} from '../../src/park-renewal/groundPlan'
import {ENTRANCE_PATHS,site} from '../../src/park-renewal/plan'
import {fountainAccessHeight} from '../../src/park-renewal/fountainAccessSurface'
import {renewalFountainTerrain} from '../../src/park-renewal/fountainAccessGeometry'
import {fountainTerrain} from '../../src/layout-preview/districtGeometry'
import {fountainPavingHeight,fountainPavingRadius} from '../../src/layout-preview/fountainPaving'
import {SITES as ORIGINAL} from '../../src/layout-preview/layout'

for(const id of ['fountain','tower','fishing','cafe']satisfies RideRoute[])for(const travel of ['bicycle','scooter']as const)it(`${id}: ${travel} 양방향과 좌우 여유 차선에서 길·경계·차체 검수`,()=>{
 for(const reverse of [false,true])for(const lane of [-.6,0,.6]){
  const s=createRide(id,travel,parkWalkSurface,reverse,lane),p=TRAVEL_PROFILES[travel]
  let grass=0
  for(let i=0;i<10000&&!s.complete&&!s.blocked;i++){
   stepRide(s,1/60,parkWalkSurface)
   const c=Math.cos(s.yaw),sn=Math.sin(s.yaw)
   for(const side of [-p.halfWidth,p.halfWidth])for(const front of [-p.halfLength,0,p.halfLength])if(isPlantingGround(s.x+c*side+sn*front,s.z-sn*side+c*front))grass++
  }
  expect(s.complete,JSON.stringify({id,travel,reverse,lane,x:s.x,z:s.z})).toBe(true)
  expect(s.blocked).toBe(false);expect(grass).toBe(0)
  expect(s.maxGrade).toBeLessThan(Math.tan(15*Math.PI/180))
  expect(s.maxRoll).toBeLessThan(Math.tan(10*Math.PI/180))
 }
},15000)

it('카페 앞 빈 공간은 접근 가능하고 실제 몸체·카운터·테라스는 통과하지 않는다',()=>{
 const s=site('cafe'),b=ENTRANCE_PATHS.find(p=>p.id==='cafe')!.b
 expect(ENTRANCE_PATHS.find(p=>p.id==='cafe')!.width).toBe(4.4)
 expect(cafeBlocksTravel(...CAFE_RIDE_STOP)).toBe(false)
 expect(cafeBlocksTravel(...b)).toBe(false)
 expect(cafeBlocksTravel(s.x-2,s.z)).toBe(true)
 expect(cafeBlocksTravel(s.x+3,s.z)).toBe(true)
 expect(canTravel([b[0],b[1]+.2],[b[0],b[1]-.8],4.285,'walk',Math.PI)).toBe(false)
})

it('분수 진입부 보이는 바닥과 이동 높이가 일치하고 기존 벤치 바닥과 원본 지형은 보존된다',()=>{
 const p=renewalFountainTerrain.getAttribute('position'),old=fountainTerrain.getAttribute('position')
 expect(p.count).toBe(old.count)
 let changed=0
 for(let i=0;i<p.count;i++){
  const dx=p.getX(i)-ORIGINAL.fountain.x,dz=p.getZ(i)-ORIGINAL.fountain.z,r=Math.hypot(dx,dz)
  if(r>fountainPavingRadius-.001&&old.getY(i)<0)continue // preserved lower skirt
  expect(p.getY(i)).toBeCloseTo(fountainAccessHeight(dx,dz),5)
  expect(old.getY(i)).toBeCloseTo(fountainPavingHeight(old.getX(i),old.getZ(i)),5)
  if(Math.abs(p.getY(i)-old.getY(i))>.001)changed++
 }
 expect(changed).toBeGreaterThan(100)
 for(const angle of [1,3,5,7].map(n=>n*Math.PI/4)){
  const dx=Math.cos(angle)*10.37,dz=Math.sin(angle)*10.37
  expect(fountainAccessHeight(dx,dz)).toBe(fountainPavingHeight(ORIGINAL.fountain.x+dx,ORIGINAL.fountain.z+dz))
 }
})
