import {Box3,Vector3} from 'three'
import {it,expect} from 'vitest'
import {plazaBuildingArt} from '../../src/layout-preview/PlazaBuildings'
import {PARK_LAYOUT} from '../../src/map/park'

it.each(['drink','photo'] as const)('keeps the complete %s roof, apron and steps inside the lawn pocket',(kind)=>{
  const k=PARK_LAYOUT.KIOSKS.find(k=>k.kind===kind)!,plaza=PARK_LAYOUT.LIFE_PLAZA
  const bounds=new Box3()
  for(const geometry of Object.values(plazaBuildingArt[kind])){
    geometry.computeBoundingBox();bounds.union(geometry.boundingBox!)
  }
  // The authored roof/apron extends beyond the smaller solid building proxy.
  expect((bounds.max.x-bounds.min.x)*k.scale).toBeGreaterThan(k.width)
  expect((bounds.max.z-bounds.min.z)*k.scale).toBeGreaterThan(k.depth)
  const world=(x:number,z:number)=>new Vector3(k.x+(x*Math.cos(k.yaw)+z*Math.sin(k.yaw))*k.scale,0,k.z+(-x*Math.sin(k.yaw)+z*Math.cos(k.yaw))*k.scale)
  const paths=PARK_LAYOUT.PATHS.filter(p=>!(kind==='drink'?['raffle-approach']:['photo-front','photo-north']).includes(p.id))
  let minPlazaDistance=Infinity,minRouteGap=Infinity,worstRoute=''
  // Sample the conservative full rectangular envelope, including its interior.
  for(let x=bounds.min.x;x<=bounds.max.x+.001;x+=.2)for(let z=bounds.min.z;z<=bounds.max.z+.001;z+=.2){
    const p=world(x,z)
    minPlazaDistance=Math.min(minPlazaDistance,Math.hypot(p.x-plaza.x,p.z-plaza.z))
    for(const route of paths)for(let n=1;n<route.points.length;n++){
      const gap=PARK_LAYOUT.nearSegment(p.x,p.z,route.points[n-1]!,route.points[n]!)-(route.width/2+.25)
      if(gap<minRouteGap)worstRoute=`${route.id} at ${p.x},${p.z}`
      minRouteGap=Math.min(minRouteGap,gap)
    }
  }
  // 같은 모든 표본의 최솟값을 검증해 수백만 번의 assertion 객체 생성을 피한다.
  expect(minPlazaDistance).toBeGreaterThan(plaza.pavingRadius+.25)
  expect(minRouteGap,worstRoute).toBeGreaterThan(0)
})
