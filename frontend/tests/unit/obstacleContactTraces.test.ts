import { it, expect, vi } from 'vitest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
vi.stubEnv('VITE_PARK_MAP','generated');vi.stubEnv('MODE','park-integration');vi.resetModules()
const {createPredictionPhysics}=await import('../../src/network/predictionPhysics')
const {PARK_DATA}=await import('../../src/map/park')
it.skipIf(!process.env.OBSTACLE_CONTACT_DIR)('exports real pavilion obstacle contact trajectories',async()=>{
 const traces=[];const stop={dx:0,dz:0,run:false,jump:false}
 for(const id of ['P0','P5'])for(const angle of [Math.PI/4,Math.PI])for(const run of [false,true])for(const timing of ['none','start','contact']){
  const sim=await createPredictionPhysics('PARK_V1')
  try{
   sim.setChairs(new Map(PARK_DATA.tables.map(t=>[t.id,2])))
   const p=PARK_DATA.pavilions.find(p=>p.id===id)!,dx=Math.cos(angle),dz=Math.sin(angle),face=3.65*p.scale*Math.cos(Math.PI/8)
   sim.reset({x:p.x+dx*(face-1.7),y:p.floor+.84,z:p.z+dz*(face-1.7),yaw:angle},0,true)
   for(let n=0;n<60;n++)sim.step(stop,1/60)
   const initial=sim.pose(),samples=[],frames=[];let jump=false
   for(let n=1;n<=180;n++){
    const intent={dx,dz,run,jump:timing==='start'?n===1:timing==='contact'?n===30:false}
    jump ||=intent.jump;sim.step(intent,1/60);frames.push({at:n/60,pose:sim.pose()})
    if(n%4===0){samples.push({at:n/60,pose:sim.pose(),run,jump});jump=false}
   }
   traces.push({scenario:`${id}/${angle}/${run?'run':'walk'}/${timing}`,initial,samples,frames})
   expect(samples).toHaveLength(45)
  }finally{sim.dispose()}
 }
 mkdirSync(process.env.OBSTACLE_CONTACT_DIR!,{recursive:true});writeFileSync(join(process.env.OBSTACLE_CONTACT_DIR!,'obstacle-traces.json'),JSON.stringify(traces))
},60000)