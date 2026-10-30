import { describe,it,expect,vi } from 'vitest'
vi.mock('../../src/park/mapSelection',()=>({GENERATED_PARK_ENABLED:true}))
import { WHEEL_VALUES,WHEEL_STEP,wheelLanding } from '../../src/features/luckyFacilities/wheel'
import { PARK_LAYOUT,PARK_DATA } from '../../src/map/park'
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
  it('places the compact fish shop beside the photo booth and shrinks the wheel footprint',()=>{
    const cart=MINI_PROPS[0],box=PARK_DATA.physics.boxes.find(b=>b.id==='fish-bread')!
    expect([cart.x,cart.z,cart.width,cart.depth]).toEqual([30,54,8.16,6.12])
    expect(box.half).toEqual([4.08,2.5925,3.06])
    expect(box.yaw).toBe(-Math.PI*2/3)
    expect(PARK_DATA.physics.boxes.find(b=>b.id==='layout-shop')!.half).toEqual([2.4,2.6,1.2])
    expect(PARK_LAYOUT.KIOSK_FENCE_RUNS.some(f=>f.id.startsWith('kiosk-shop-'))).toBe(false)
    expect(box.center).toEqual([cart.x,2.5925,cart.z])
    expect(PARK_LAYOUT.KIOSKS.filter(k=>k.kind!=='photo').map(k=>[k.kind,k.x,k.z,k.yaw])).toEqual([
      ['shop',-29.5,36,Math.PI/3],['drink',-30,54,Math.PI*2/3],
    ])
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
})
