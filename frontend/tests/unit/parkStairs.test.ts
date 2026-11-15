import { expect, it, vi } from 'vitest'
vi.mock('../../src/park/mapSelection', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/park/mapSelection')>(),
  GENERATED_PARK_ENABLED: true,
  RENEWAL_PARK_ENABLED: false,
  JUMPMAP_ENABLED: true,
}))
import { createPredictionPhysics } from '../../src/network/predictionPhysics'
import { PARK_DATA } from '../../src/map/park'
import { MOVEMENT } from '../../src/config'
const stop={dx:0,dz:0,run:false,jump:false}
const cases=PARK_DATA.pavilions.flatMap(p=>[-1,1].flatMap(side=>[false,true].flatMap(run=>[60,120].map(hz=>({id:p.id,side,run,hz,tuned:true})))))
cases.push({id:'P0',side:1,run:false,hz:60,tuned:false},{id:'P1',side:1,run:false,hz:60,tuned:false})
it.each(cases)('climbs $id side=$side run=$run hz=$hz tuned=$tuned without jumping',async({id,side,run,hz,tuned})=>{
 const p=PARK_DATA.pavilions.find(p=>p.id===id)!,steps=PARK_DATA.physics.boxes.filter(b=>b.id.startsWith(id+'-step-'+side+'-'))
 const outer=side>0?Math.max(...steps.map(b=>b.center[2]+b.half[2])):Math.min(...steps.map(b=>b.center[2]-b.half[2]))
 const inner=side>0?Math.min(...steps.map(b=>b.center[2]-b.half[2])):Math.max(...steps.map(b=>b.center[2]+b.half[2]))
 const sim=await createPredictionPhysics(tuned?'PARK_V1':undefined)
 try{sim.reset({x:p.x,y:p.ground+MOVEMENT.halfHeight+MOVEMENT.radius+MOVEMENT.offset,z:outer+side,yaw:Math.PI},0,true)
  let highest=sim.pose().y
  for(let n=0;n<hz*4;n++){sim.step({...stop,dz:-side,run},1/hz);highest=Math.max(highest,sim.pose().y);
   if(tuned){const at=sim.pose(),under=steps.filter(b=>Math.abs(at.x-b.center[0])<=b.half[0]&&Math.abs(at.z-b.center[2])<=b.half[2]);
    if(under.length)expect(at.y-MOVEMENT.halfHeight-MOVEMENT.radius).toBeGreaterThan(Math.max(...under.map(b=>b.center[1]+b.half[1]))-.03)
   }
   if(side*(sim.pose().z-inner)<-.05)break}
  const result={id,tuned,outer,inner,pose:sim.pose(),highest,expectedFloor:p.floor}
  expect(side*(result.pose.z-inner)).toBeLessThan(-.03)
  expect(highest-MOVEMENT.halfHeight-MOVEMENT.radius).toBeGreaterThan(p.floor-.05)
 }finally{sim.dispose()}
})

it.each([false,true])('keeps flat-road walking continuous with split input frames=%s',async split=>{
 const sim=await createPredictionPhysics('PARK_V1')
 try{
  sim.reset({x:0,y:.8001,z:82,yaw:Math.PI},0,true)
  let elapsed=0,index=0,resets=0
  while(elapsed<8){const dt=Math.min(split?[.0007,.0069,.0072,.0083][index++%4]!:1/120,8-elapsed)
   sim.step({...stop,dz:-1},dt);elapsed+=dt
   const motion=(sim as unknown as {parkMotion:{vz:number}}).parkMotion
   if(elapsed>.5&&Math.abs(motion.vz)<.01)resets++
  }
  const distance=82-sim.pose().z
  console.log(JSON.stringify({split,distance,resets}))
  expect(distance).toBeGreaterThan(46)
  expect(resets).toBe(0)
 }finally{sim.dispose()}
})

it('preserves the optional course coyote and landing buffer on PARK_V1',async()=>{
 const {useJumpmap}=await import('../../src/features/jumpmap/state')
 useJumpmap.setState({available:true})
 const sim=await createPredictionPhysics('PARK_V1')
 try {
  sim.reset({x:0,y:1.05,z:75,yaw:0},0,false,{coyoteTicks:3,jumpBufferTicks:0})
  const before=sim.pose().y
  sim.step({...stop,jump:true},1/60)
  expect(sim.pose().y).toBeGreaterThan(before+.1)
  sim.reset({x:0,y:.8001,z:75,yaw:0},0,false,{coyoteTicks:0,jumpBufferTicks:4})
  let peak=sim.pose().y
  for(let n=0;n<30;n++){sim.step(stop,1/60);peak=Math.max(peak,sim.pose().y)}
  expect(peak).toBeGreaterThan(1.8)
 }finally{sim.dispose();useJumpmap.setState({available:false})}
})
