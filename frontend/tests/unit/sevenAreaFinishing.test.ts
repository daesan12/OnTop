import {expect,it} from 'vitest'
import {FISHING_NOTICE,FISHING_UPPER,FISHING_STAIRS,ENTRANCE_PATHS,heightAt,inLake,onRoad,site} from '../../src/park-renewal/plan'
import {isPlantingGround,onLand} from '../../src/park-renewal/groundPlan'
import {parkGround} from '../../src/park-renewal/groundGeometry'
import {inPolygon} from '../../src/park-renewal/roundedFootprint'
import {parkWalkSurface} from '../../src/park-renewal/surfaceHeight'

it('벽체가 코너 주변 최저 지반 아래까지 이어져 흰 삼각형 틈을 남기지 않는다',()=>{
 const p=parkGround.retaining.getAttribute('position')
 expect(parkGround.retaining.boundingBox!.min.y).toBeLessThan(3)
 let cornerBottoms=0
 for(let i=0;i<p.count;i++)if(Math.abs(p.getX(i)+26)<1.1&&Math.abs(p.getZ(i)+94)<1.1&&p.getY(i)<3)cornerBottoms++
 expect(cornerBottoms).toBeGreaterThan(0)
})

it('팔각정 앞 돌길의 잔디 찌꺼기를 지우고 독립 잔디섬을 둥글게 유지한다',()=>{
 for(const [x,z]of[[-59.03,66.34],[-59.03,66.42],[-59.1,66.56],[-59.3,66.7]]as const){expect(onLand(x,z)).toBe(true);expect(isPlantingGround(x,z)).toBe(false)}
 expect(isPlantingGround(-51.4,61.5)).toBe(true)
 for(const [x,z]of[[-51.4,65],[-55.5,61.5],[-47,61.5]]as const)expect(isPlantingGround(x,z)).toBe(false)
})

it('분수 연결부와 전망대 진입로를 비우고 전망대 주변의 잔디를 복구한다',()=>{
 for(let x=23;x<=28.5;x+=.25)expect(isPlantingGround(x,56)).toBe(false)
 expect(isPlantingGround(96,24)).toBe(true)
 expect(isPlantingGround(84,27)).toBe(false)
 expect(isPlantingGround(89.5,24)).toBe(false)
})

it('낚시터 푯말 전체가 육지에 있고 넓어진 데크와 계단을 이용할 수 있다',()=>{
 for(const dx of[-.4,0,.4])for(const dz of[-1.5,0,1.5]){
  expect(inLake(FISHING_NOTICE.x+dx,FISHING_NOTICE.z+dz)).toBe(false)
  expect(onRoad(FISHING_NOTICE.x+dx,FISHING_NOTICE.z+dz)).toBe(false)
 }
 expect(FISHING_STAIRS.width).toBeGreaterThanOrEqual(2.4)
 for(let x=85.2;x<=87.2;x+=.2)expect(inPolygon(x,-45.6,FISHING_UPPER.outline)).toBe(true)
})

it('카페의 건물·테라스 주변은 평탄하고 입구는 연속된 완만한 길이다',()=>{
 const cafe=site('cafe')
 for(let dx=-7;dx<=7;dx++)for(let dz=-5;dz<=5;dz++)expect(heightAt(cafe.x+dx,cafe.z+dz)).toBeCloseTo(4.2,6)
 const path=ENTRANCE_PATHS.find(p=>p.id==='cafe')!,n=80
 let previous=parkWalkSurface(...path.b)
 for(let i=1;i<=n;i++){
  const t=i/n,x=path.b[0]+(path.a[0]-path.b[0])*t,z=path.b[1]+(path.a[1]-path.b[1])*t,y=parkWalkSurface(x,z)
  expect(Math.abs(y-previous)).toBeLessThan(.16);previous=y
 }
})
