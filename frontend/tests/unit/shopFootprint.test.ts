import {Box3,Vector3} from 'three'
import {it,expect} from 'vitest'
import {plazaBuildingArt} from '../../src/layout-preview/PlazaBuildings'
import {PARK_LAYOUT} from '../../src/map/park'

it.each(['shop','photo'] as const)('keeps the complete %s roof, apron and steps inside the lawn pocket',(kind)=>{
  const k=PARK_LAYOUT.KIOSKS.find(k=>k.kind===kind)!,plaza=PARK_LAYOUT.LIFE_PLAZA
  const bounds=new Box3()
  for(const geometry of Object.values(plazaBuildingArt[kind])){
    geometry.computeBoundingBox();bounds.union(geometry.boundingBox!)
  }
  // The authored roof/apron extends beyond the smaller solid building proxy.
  expect(bounds.max.x-bounds.min.x).toBeGreaterThan(k.width)
  expect(bounds.max.z-bounds.min.z).toBeGreaterThan(k.depth)
  const world=(x:number,z:number)=>new Vector3(k.x+x*Math.cos(k.yaw)+z*Math.sin(k.yaw),0,k.z-x*Math.sin(k.yaw)+z*Math.cos(k.yaw))
  const paths=PARK_LAYOUT.PATHS.filter(p=>!(kind==='shop'?['shop-approach']:['photo-front','photo-north']).includes(p.id))
  // Sample the conservative full rectangular envelope, including its interior.
  for(let x=bounds.min.x;x<=bounds.max.x+.001;x+=.2)for(let z=bounds.min.z;z<=bounds.max.z+.001;z+=.2){
    const p=world(x,z)
    expect(Math.hypot(p.x-plaza.x,p.z-plaza.z)).toBeGreaterThan(plaza.pavingRadius+.25)
    for(const route of paths)for(let n=1;n<route.points.length;n++){
      expect(PARK_LAYOUT.nearSegment(p.x,p.z,route.points[n-1]!,route.points[n]!),route.id).toBeGreaterThan(route.width/2+.25)
    }
  }
})
