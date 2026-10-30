import { describe,it,expect,vi } from 'vitest'
vi.mock('../../src/park/mapSelection',()=>({GENERATED_PARK_ENABLED:true}))
import { WHEEL_VALUES,WHEEL_STEP,wheelLanding } from '../../src/features/luckyFacilities/wheel'
import { PARK_LAYOUT,PARK_DATA } from '../../src/map/park'
import { MINI_PROPS } from '../../src/park/mapConfig'
import { canReachBungeoppang } from '../../src/features/bungeoppang/access'

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
  it('enlarges only the fish shop collision and retains the two plaza anchors',()=>{
    const cart=MINI_PROPS[0],box=PARK_DATA.physics.boxes.find(b=>b.id==='fish-bread')!
    expect([cart.width,cart.depth]).toEqual([9.6,7.2])
    expect(box.half).toEqual([4.8,3.05,3.6])
    expect(box.center).toEqual([cart.x,3.05,cart.z])
    expect(PARK_LAYOUT.KIOSKS.filter(k=>k.kind!=='photo').map(k=>[k.kind,k.x,k.z,k.yaw])).toEqual([
      ['shop',-29.5,36,Math.PI/3],['drink',-30,54,Math.PI*2/3],
    ])
  })
  it('permits the front serving apron and rejects the back, interior and non-finite coordinates',()=>{
    const cart=MINI_PROPS[0],z=cart.z+cart.depth/2+1
    for(const x of [cart.x-3,cart.x,cart.x+3]){
      expect(canReachBungeoppang({x,y:.14,z})).toBe(true)
      expect(PARK_LAYOUT.canWalk(x,z)).toBe(true)
    }
    expect(canReachBungeoppang({x:cart.x,y:.14,z:cart.z})).toBe(false)
    expect(canReachBungeoppang({x:cart.x,y:.14,z:cart.z-cart.depth/2-1})).toBe(false)
    expect(canReachBungeoppang({x:NaN,y:.14,z})).toBe(false)
    expect(canReachBungeoppang({x:cart.x,y:5,z})).toBe(false)
  })
})
