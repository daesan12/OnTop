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
it('does not launch a jump mid-air beside a thin fence top edge with no contact',async()=>{
 // dev trace beside court-P0-west (top 1.1m): Rapier reported grounded with zero
 // collisions around y=1.6, the client jumped there and the server rejected it.
 const sim=await createPredictionPhysics('PARK_V1')
 try{
  sim.reset({x:-12.61,y:2,z:18.32,yaw:0},0,false)
  let previous=sim.pose().y
  for(let n=1;n<=17;n++){
   sim.step({dx:0,dz:0,run:false,jump:true},1/60)
   expect(sim.pose().y).toBeLessThanOrEqual(previous+1e-6)
   previous=sim.pose().y
  }
  for(let n=0;n<30;n++)sim.step({dx:0,dz:0,run:false,jump:false},1/60)
  expect(sim.pose().y).toBeCloseTo(.8,2)
 }finally{sim.dispose()}
})
it('slides off a fence top edge the server does not support instead of perching there',async()=>{
 // Centre 26cm past the fence edge: the server sees no support (HOVER) and rejects jumps.
 const sim=await createPredictionPhysics('PARK_V1')
 try{
  sim.reset({x:-12.67,y:2.1,z:18.32,yaw:0},0,false)
  for(let n=0;n<45;n++)sim.step({dx:0,dz:0,run:false,jump:false},1/60)
  expect(sim.pose().y).toBeCloseTo(.8,2)
  expect(sim.pose().x).toBeGreaterThan(-12.67)
 }finally{sim.dispose()}
})
it('does not hang in the air when jumping in place beside a fence',async()=>{
 // Local trace beside hall-court-east: repeated jumps stalled around y=1.6-1.76 until HOVER.
 const sim=await createPredictionPhysics('PARK_V1')
 try{
  sim.reset({x:-46.39,y:.8,z:-15.84,yaw:0},0,true)
  let still=0,longest=0,last=sim.pose().y
  for(let n=0;n<300;n++){
   sim.step({dx:0,dz:0,run:false,jump:n%12===0},1/60)
   const y=sim.pose().y
   still=y>1&&Math.abs(y-last)<.003?still+1:0;longest=Math.max(longest,still);last=y
  }
  expect(longest).toBeLessThanOrEqual(3)
 }finally{sim.dispose()}
})
it('does not glide along a fence top corner while running against it',async()=>{
 // Running almost parallel to court-P0-west after a jump rested the capsule on its rounded
 // corner (normal y ~.61) for over a second with no server support, ending in HOVER.
 const sim=await createPredictionPhysics('PARK_V1')
 try{
  sim.reset({x:-12.55,y:.8,z:8,yaw:0},0,true)
  for(let n=0;n<10;n++)sim.step({dx:0,dz:0,run:false,jump:false},1/60)
  for(let n=1;n<=70;n++)sim.step({dx:-Math.cos(1.45),dz:Math.sin(1.45),run:true,jump:n===1},1/60)
  expect(sim.pose().y).toBeCloseTo(.8,2)
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
