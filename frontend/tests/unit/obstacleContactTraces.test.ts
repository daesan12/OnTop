import { it, expect, vi } from 'vitest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
vi.stubEnv('VITE_PARK_MAP','generated');vi.stubEnv('MODE','park-integration');vi.resetModules()
const {createPredictionPhysics}=await import('../../src/network/predictionPhysics')
const {PARK_DATA}=await import('../../src/map/park')
it('does not stand or launch another jump from a near-vertical fence contact',async()=>{
 const sim=await createPredictionPhysics('PARK_V1')
 try{
  sim.reset({x:20.360178,y:1.592703,z:6.002982,yaw:0},0,false)
  let highest=sim.pose().y
  for(let n=1;n<=90;n++){
   sim.step({dx:1,dz:0,run:true,jump:n===15},1/60)
   highest=Math.max(highest,sim.pose().y)
  }
  expect(highest).toBeLessThan(1.7)
  expect(sim.pose().y).toBeLessThan(1.1)
 }finally{sim.dispose()}
})
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
 for(const id of ['P0','P5'])for(const angle of [0,Math.PI/4,Math.PI/2,Math.PI,Math.PI*1.5])for(const period of [18,37]){
  const sim=await createPredictionPhysics('PARK_V1')
  try{
   sim.setChairs(new Map(PARK_DATA.tables.map(t=>[t.id,2])))
   const p=PARK_DATA.pavilions.find(p=>p.id===id)!,face=3.65*p.scale*Math.cos(Math.PI/8)
   sim.reset({x:p.x+Math.cos(angle)*(face-1.7),y:p.floor+.84,z:p.z+Math.sin(angle)*(face-1.7),yaw:angle},0,true)
   for(let n=0;n<60;n++)sim.step(stop,1/60)
   const initial=sim.pose(),samples=[],frames=[];let jump=false
   for(let n=1;n<=720;n++){
    const direction=angle+(Math.floor((n-1)/120)%2)*Math.PI
    const intent={dx:Math.cos(direction),dz:Math.sin(direction),run:true,jump:(n-1)%period===0}
    jump ||=intent.jump;sim.step(intent,1/60)
    const debug=sim as unknown as {grounded:boolean;controller:{numComputedCollisions():number;computedCollision(i:number):{normal1:{x:number;y:number;z:number}}|null}}
    const normals=[];if(n>=340&&n<=365)for(let i=0;i<debug.controller.numComputedCollisions();i++)normals.push(debug.controller.computedCollision(i)?.normal1)
    frames.push({at:n/60,pose:sim.pose(),grounded:debug.grounded,normals})
    if(n%4===0){samples.push({at:n/60,pose:sim.pose(),run:true,jump});jump=false}
   }
   traces.push({scenario:`${id}/${angle}/repeat-${period}`,initial,samples,frames})
  }finally{sim.dispose()}
 }
 for(const id of ['P0','P5'])for(const side of [-1,1])for(const period of [18,27])for(const phase of [0,5,11]){
  const sim=await createPredictionPhysics('PARK_V1')
  try{
   sim.setChairs(new Map(PARK_DATA.tables.map(t=>[t.id,2])))
   const p=PARK_DATA.pavilions.find(p=>p.id===id)!,steps=PARK_DATA.physics.boxes.filter(b=>b.id.startsWith(`${id}-step-${side}-`))
   const outer=side>0?Math.max(...steps.map(b=>b.center[2]+b.half[2])):Math.min(...steps.map(b=>b.center[2]-b.half[2]))
   sim.reset({x:p.x,y:p.ground+.84,z:outer+side*.8,yaw:0},0,true)
   for(let n=0;n<60;n++)sim.step(stop,1/60)
   const initial=sim.pose(),samples=[],frames=[];let jump=false
   for(let n=1;n<=720;n++){
    const dz=-side*(Math.floor((n-1)/120)%2?-1:1),intent={dx:0,dz,run:true,jump:(n-1+phase)%period===0}
    jump ||=intent.jump;sim.step(intent,1/60);frames.push({at:n/60,pose:sim.pose()})
    if(n%4===0){samples.push({at:n/60,pose:sim.pose(),run:true,jump});jump=false}
   }
   traces.push({scenario:`stairs/${id}/${side}/${period}/${phase}`,initial,samples,frames})
  }finally{sim.dispose()}
 }
 mkdirSync(process.env.OBSTACLE_CONTACT_DIR!,{recursive:true});writeFileSync(join(process.env.OBSTACLE_CONTACT_DIR!,'obstacle-traces.json'),JSON.stringify(traces))
},60000)
