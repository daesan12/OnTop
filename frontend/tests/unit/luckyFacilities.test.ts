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
  it('swaps the fish shop and wheel and clusters the scaled lottery booth on the east',()=>{
    const cart=MINI_PROPS[0],box=PARK_DATA.physics.boxes.find(b=>b.id==='fish-bread')!
    expect([cart.x,cart.z,cart.width,cart.depth]).toEqual([-29.5,36,8.448,6.336])
    expect(box.half).toEqual([4.224,2.684,3.168])
    expect(box.yaw).toBe(Math.PI/3)
    expect(PARK_DATA.physics.boxes.find(b=>b.id==='layout-shop')!.half).toEqual([2,2.15,1])
    expect(PARK_LAYOUT.KIOSK_FENCE_RUNS.some(f=>f.id.startsWith('kiosk-shop-'))).toBe(false)
    expect(box.center).toEqual([cart.x,2.684,cart.z])
    expect(PARK_LAYOUT.KIOSKS.filter(k=>k.kind!=='photo').map(k=>[k.kind,k.x,k.z,k.yaw])).toEqual([
      ['shop',27,50.8,-Math.PI/2],['drink',32.5,54.8,-Math.PI/2],
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
  it('leaves a passage between the eastern pair and preserves the photo replacement area',()=>{
    const wheel=PARK_LAYOUT.KIOSKS.find(k=>k.kind==='shop')!,lottery=PARK_LAYOUT.KIOSKS.find(k=>k.kind==='drink')!
    const dx=lottery.x-wheel.x,dz=lottery.z-wheel.z
    const across=Math.abs(dx*Math.cos(wheel.yaw)-dz*Math.sin(wheel.yaw))
    const forward=Math.abs(dx*Math.sin(wheel.yaw)+dz*Math.cos(wheel.yaw))
    const acrossGap=across-(wheel.width+lottery.width)/2
    const forwardGap=forward-(wheel.depth+lottery.depth)/2
    expect(Math.max(acrossGap,forwardGap)).toBeGreaterThan(2)
    expect(PARK_LAYOUT.KIOSKS.find(k=>k.kind==='photo')).toMatchObject({x:30,z:35.6,width:8.8,depth:6.6,yaw:-Math.PI/3})
    for(const site of PARK_DATA.interactions.construction){
      const [x,,z]=site.reachPosition
      expect(PARK_LAYOUT.canWalk(x,z),site.id).toBe(true)
    }
  })
})
