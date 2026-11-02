import { it, expect, vi } from 'vitest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
vi.stubEnv('VITE_PARK_MAP','generated'); vi.stubEnv('MODE','park-integration'); vi.resetModules()
const { createPredictionPhysics }=await import('../../src/network/predictionPhysics')
const { LAKE,SWIMMING,groundHeight,lakeRadiusAt }=await import('../../src/park/mapConfig')
const { PARK_DATA }=await import('../../src/map/park')
it.skipIf(!process.env.UNIFIED_MOVEMENT_DIR)('feeds actual Rapier region trajectories into the Java validator',async()=>{
 const traces:any[]=[];const stop={dx:0,dz:0,run:false,jump:false}
 const water=[-5,0,5].flatMap(dx=>[-8,0,8].map(dz=>({x:LAKE.x+dx,z:LAKE.z+dz}))).find(p=>lakeRadiusAt(p.x,p.z)<.7&&LAKE.surfaceY-groundHeight(p.x,p.z)>1)!
 const tower=PARK_DATA.physics.tower,radius=(tower.inner+tower.outer)/2
 for(const scenario of ['ground','water','shore','tower']){
  const sim=await createPredictionPhysics('PARK_V1')
  try{
   const shore={x:LAKE.x+LAKE.radiusX+2,z:LAKE.z};const start=scenario==='shore'?{...shore,y:groundHeight(shore.x,shore.z)+.84,yaw:0}:scenario==='water'?{...water,y:LAKE.surfaceY+SWIMMING.floatOffset-.2,yaw:0}:scenario==='tower'?{x:tower.x+radius,y:tower.surfaceOffset+.84,z:tower.z,yaw:0}:{x:0,y:.84,z:82,yaw:0}
   sim.reset(start,0,false)
   if(scenario!=='water')for(let n=0;n<60;n++)sim.step(stop,1/60)
   const initial=sim.pose(),samples:any[]=[];let jump=false,wasWater=false,leftWater=false
   for(let n=1;n<=(scenario==='tower'?540:scenario==='shore'?600:240);n++){
    const p=sim.pose();let intent={...stop}
    if(scenario==='ground')intent={dx:n<160?(n<80?.7:-.7):0,dz:n<160?-.7:0,run:n>30,jump:n===60}
    if(scenario==='shore')intent={...stop,dx:n<=240?-1:1,run:true}
    if(scenario==='water')intent={...stop,dx:n>60?.5:0,dz:n>60?.5:0,run:n>120}
    if(scenario==='tower'){const a=Math.atan2(p.z-tower.z,p.x-tower.x)+.08,dx=tower.x+radius*Math.cos(a)-p.x,dz=tower.z+radius*Math.sin(a)-p.z,l=Math.hypot(dx,dz);intent={...stop,dx:dx/l,dz:dz/l}}
    jump ||=intent.jump;sim.step(intent,1/60)
    const q=sim.pose(),wet=lakeRadiusAt(q.x,q.z)<1&&LAKE.surfaceY-groundHeight(q.x,q.z)>SWIMMING.depthThreshold&&q.y<LAKE.surfaceY+.4;wasWater ||=wet;leftWater ||=wasWater&&!wet
    if(n%4===0){samples.push({at:n/60,pose:sim.pose(),run:intent.run,jump});jump=false}
   }
   if(scenario==='shore'){expect(wasWater).toBe(true);expect(leftWater).toBe(true)}
   traces.push({scenario,initial,samples});expect(samples.length).toBeGreaterThan(40)
  }finally{sim.dispose()}
 }
 mkdirSync(process.env.UNIFIED_MOVEMENT_DIR!,{recursive:true});writeFileSync(join(process.env.UNIFIED_MOVEMENT_DIR!,'rapier-regions.json'),JSON.stringify(traces,null,2))
 vi.unstubAllEnvs()
})
