import { describe,it,expect,vi } from 'vitest'
vi.mock('../../src/park/mapSelection',()=>({GENERATED_PARK_ENABLED:true}))
import { WHEEL_VALUES,WHEEL_STEP,wheelLanding } from '../../src/features/luckyFacilities/wheel'
import { PARK_LAYOUT,PARK_DATA,PARK_DEFINITION,resolveParkLayout } from '../../src/map/park'
import { MINI_PROPS } from '../../src/park/mapConfig'
import { canReachBungeoppang } from '../../src/features/bungeoppang/access'
import { PARK_DESTINATIONS } from '../../src/features/navigation/parkNavigation'

describe('lucky facility mock and enlarged fish shop',()=>{
  it('lands the visible pointer on the reported sector after repeated spins',()=>{
    let previous=0
    for(let round=0;round<3;round++)for(let index=0;index<WHEEL_VALUES.length;index++){
      const landing=wheelLanding(previous,index)
      expect(landing-previous).toBeGreaterThanOrEqual(1800)
      expect(((landing+index*WHEEL_STEP)%360+360)%360).toBeCloseTo(0)
      previous=landing
    }
  })
  it('keeps the enlarged fish shop and places the lottery booth toward the plaza centre',()=>{
    const cart=MINI_PROPS[0],box=PARK_DATA.physics.boxes.find(b=>b.id==='fish-bread')!
    expect([cart.x,cart.z,cart.width,cart.depth]).toEqual([-30.1,35.8,9.216,6.912])
    expect(box.half).toEqual([4.608,2.928,3.456])
    expect(box.yaw).toBe(Math.PI/3)
    expect(PARK_LAYOUT.KIOSK_FENCE_RUNS.some(f=>f.id.startsWith('kiosk-shop-'))).toBe(false)
    expect(box.center).toEqual([cart.x,2.928,cart.z])
    expect(PARK_LAYOUT.KIOSKS.filter(k=>k.kind!=='photo').map(k=>[k.kind,k.x,k.z,k.yaw])).toEqual([
      ['drink',31.8,54.6,Math.atan2(-31.8,46-54.6)],
    ])
  })
  it('temporarily removes the wheel from rendering data, movement, physics, notices and markers',()=>{
    for(const list of [PARK_DATA.facilities,PARK_DATA.collision.obstacles,PARK_DATA.physics.boxes,PARK_DATA.interactions.construction,PARK_LAYOUT.MARKERS]){
      expect(list.some(item=>item.id==='layout-shop')).toBe(false)
    }
    expect(PARK_LAYOUT.KIOSKS.some(k=>k.kind==='shop')).toBe(false)
    expect(PARK_LAYOUT.PATHS.some(p=>p.id==='shop-approach')).toBe(false)
    expect(PARK_LAYOUT.canWalk(27,50.8)).toBe(true)
    // Restoring the flag reuses the persistent ID, not a replacement facility.
    const restored=structuredClone(PARK_DEFINITION);restored.kiosks.shop.enabled=true
    const map=resolveParkLayout(restored)
    expect(map.data.facilities.some(f=>f.id==='layout-shop')).toBe(true)
    expect(map.data.physics.boxes.find(f=>f.id==='layout-shop')!.half).toEqual([2,2.15,1])
  })
  it('permits the front serving apron and rejects the back, interior and non-finite coordinates',()=>{
    const cart=MINI_PROPS[0],yaw='yaw' in cart?cart.yaw:0
    const point=(across:number,forward:number)=>({x:cart.x+across*Math.cos(yaw)+forward*Math.sin(yaw),y:.14,z:cart.z-across*Math.sin(yaw)+forward*Math.cos(yaw)})
    for(const across of [-2.2,0,2.2]){
      const p=point(across,cart.depth/2+1)
      expect(canReachBungeoppang(p)).toBe(true)
      expect(PARK_LAYOUT.canWalk(p.x,p.z)).toBe(true)
    }
    const navigation=PARK_DESTINATIONS.mini!
    expect(canReachBungeoppang({...navigation,y:.14})).toBe(true)
    expect(PARK_LAYOUT.canWalk(navigation.x,navigation.z)).toBe(true)
    const {z}=point(0,cart.depth/2+1)
    expect(canReachBungeoppang({x:cart.x,y:.14,z:cart.z})).toBe(false)
    expect(canReachBungeoppang(point(0,-cart.depth/2-1))).toBe(false)
    expect(canReachBungeoppang({x:NaN,y:.14,z})).toBe(false)
    expect(canReachBungeoppang({x:cart.x,y:5,z})).toBe(false)
  })
  it('aligns a straight walkable path with the lottery entrance and preserves the photo area',()=>{
    const lottery=PARK_LAYOUT.KIOSKS.find(k=>k.kind==='drink')!,p=PARK_LAYOUT.LIFE_PLAZA
    expect(lottery.yaw).toBeCloseTo(Math.atan2(p.x-lottery.x,p.z-lottery.z))
    const route=PARK_LAYOUT.PATHS.find(r=>r.id==='raffle-approach')!
    expect(route.points).toHaveLength(2)
    const [start,end]=route.points
    expect(Math.hypot(start![0]-p.x,start![1]-p.z)).toBeLessThan(p.pavingRadius)
    for(const point of route.points){
      const dx=point[0]-lottery.x,dz=point[1]-lottery.z
      expect(dx*Math.cos(lottery.yaw)-dz*Math.sin(lottery.yaw)).toBeCloseTo(0)
    }
    // Paving tucks under the raised threshold; players stop at the serving point.
    expect(Math.hypot(end![0]-lottery.x,end![1]-lottery.z)).toBeCloseTo(lottery.depth/2-.15)
    const reach=PARK_DATA.interactions.construction.find(s=>s.id==='layout-drink')!.reachPosition
    for(let n=0;n<=30;n++)expect(PARK_LAYOUT.canWalk(start![0]+(reach[0]-start![0])*n/30,start![1]+(reach[2]-start![1])*n/30)).toBe(true)
    expect(PARK_LAYOUT.KIOSKS.find(k=>k.kind==='photo')).toMatchObject({x:30,z:35.6,width:9.6,depth:6.6,yaw:-Math.PI/3,fenced:false})
    for(const site of PARK_DATA.interactions.construction){
      const [x,,z]=site.reachPosition
      expect(PARK_LAYOUT.canWalk(x,z),site.id).toBe(true)
    }
  })
})
