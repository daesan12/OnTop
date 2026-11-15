import {expect,it} from 'vitest'
import {ParkMotion,PARK_MOTION as MC} from '../../src/network/parkMotion'
import {createPredictionPhysics} from '../../src/network/predictionPhysics'
const stop={dx:0,dz:0,run:false,jump:false}
it('uses normal selected park-ground walking and sprinting targets without instant top-speed jumps',()=>{
 for(const run of [false,true]){const m=new ParkMotion(),input={...stop,dx:1,run};let distance=0
  expect(m.advance(input,1/60,true).x*60).toBeLessThan(1)
  for(let n=0;n<120;n++)m.advance(input,1/60,true)
  for(let n=0;n<60;n++)distance+=m.advance(input,1/60,true).x
  expect(distance).toBeCloseTo(run?MC.runSpeed:MC.walkSpeed,3)
 }
})
it('matches the selected park 20Hz jump recurrence across 20,30,60 and120Hz collision substeps',()=>{
 for(const hz of [20,30,60,120]){const m=new ParkMotion();let y=0,peak=0
  for(let n=0;n<hz;n++){y+=m.advance({...stop,jump:n===0},1/hz,n===0).y;peak=Math.max(peak,y)}
  expect(peak).toBeCloseTo(1.20961489896,4)
 }
})
it('retains airborne momentum and brakes harder on the ground',()=>{
 const ground=new ParkMotion(),air=new ParkMotion();const forward={...stop,dx:1,run:true},back={...stop,dx:-1,run:true}
 for(let n=0;n<120;n++){ground.advance(forward,1/60,true);air.advance(forward,1/60,true)}
 let gd=0,ad=0;for(let n=0;n<6;n++){gd+=ground.advance(back,1/60,true).x;ad+=air.advance(back,1/60,false).x}
 expect(ad).toBeGreaterThan(gd+.1)
})
it('clears grounded sprint velocity on the first step without movement input', () => {
 const ground = new ParkMotion(), air = new ParkMotion()
 const sprint = { ...stop, dx: 1, run: true }
 for (let frame = 0; frame < 60; frame++) {
  ground.advance(sprint, 1 / 60, true)
  air.advance(sprint, 1 / 60, true)
 }
 expect(ground.advance(stop, 1 / 60, true)).toMatchObject({ x: 0, z: 0 })
 expect(ground.flags()).toEqual({ moving: false, running: false })
 expect(air.advance(stop, 1 / 60, false).x).toBeGreaterThan(0)
})
it('actual Rapier jump lands at a stable floor and reaches the reference height',async()=>{
 const sim=await createPredictionPhysics('PARK_V1')
 try {sim.reset({x:-10,y:.84,z:42,yaw:0},0,true);const ys:number[]=[]
  for(let n=0;n<180;n++){sim.step({...stop,jump:n===0},1/60);ys.push(sim.pose().y)}
  const tail=ys.slice(-60),floor=ys.at(-1)!
  expect(Math.max(...ys)-floor).toBeCloseTo(1.20961489896,1)
  expect(Math.max(...tail)-Math.min(...tail)).toBeLessThan(.002)
 }finally{sim.dispose()}
})
it('clips movement against actual geometry rather than drifting through a wall',async()=>{
 const sim=await createPredictionPhysics('PARK_V1')
 try{sim.reset({x:-10,y:.84,z:42,yaw:0},0,true)
  const rapier=await import('@dimforge/rapier3d-compat');const world=(sim as unknown as {world:InstanceType<typeof rapier.default.World>}).world
  world.createCollider(rapier.default.ColliderDesc.cuboid(.1,2,2).setTranslation(-8,1,42))
  for(let n=0;n<180;n++)sim.step({...stop,dx:1,run:true},1/60)
  expect(sim.pose().x).toBeLessThan(-8.35)
 }finally{sim.dispose()}
})

it('reports swimming movement without changing the ground momentum profile',async()=>{
 const {LAKE,groundHeight,lakeRadiusAt}=await import('../../src/config')
 const sim=await createPredictionPhysics('PARK_V1')
 try{const water=[-6,0,6].flatMap(dx=>[-10,0,10].map(dz=>({x:LAKE.x+dx,z:LAKE.z+dz}))).find(p=>lakeRadiusAt(p.x,p.z)<.8&&LAKE.surfaceY-groundHeight(p.x,p.z)>1)!
  expect(water).toBeTruthy();sim.reset({...water,y:LAKE.surfaceY-.12,yaw:0},0,false)
  sim.step({...stop,dx:1},1/60);expect(sim.movementFlags?.()).toEqual({moving:true,running:false})
  sim.reset({x:-10,y:.84,z:42,yaw:0},0,true);sim.step({...stop,dx:1},1/60)
  expect(sim.movementFlags?.()?.moving).toBe(true)
 }finally{sim.dispose()}
})

it('still accepts a jump after standing on the floor for two seconds',async()=>{
 const sim=await createPredictionPhysics('PARK_V1')
 try{sim.reset({x:-10,y:.84,z:42,yaw:0},0,true)
  for(let n=0;n<120;n++)sim.step(stop,1/60)
  const floor=sim.pose().y;let peak=floor
  for(let n=0;n<90;n++){sim.step({...stop,jump:n===0},1/60);peak=Math.max(peak,sim.pose().y)}
  expect(peak-floor).toBeGreaterThan(1)
 }finally{sim.dispose()}
})

it('accepts jump immediately after a short input-boundary physics step',async()=>{
 const sim=await createPredictionPhysics('PARK_V1')
 try{sim.reset({x:0,y:.8001,z:75,yaw:0},0,true)
  for(let n=0;n<120;n++)sim.step(stop,1/60)
  sim.step(stop,.00001)
  const floor=sim.pose().y;let peak=floor
  for(let n=0;n<90;n++){sim.step({...stop,jump:n===0},1/60);peak=Math.max(peak,sim.pose().y)}
  expect(peak-floor).toBeGreaterThan(1)
 }finally{sim.dispose()}
})

it.each([.00001,.00002,.0001,.001,.003])('preserves jump velocity across a %ss first jump substep',async firstStep=>{
 const sim=await createPredictionPhysics('PARK_V1')
 try{sim.reset({x:0,y:.8001,z:75,yaw:0},0,true)
  for(let n=0;n<120;n++)sim.step(stop,1/60)
  const floor=sim.pose().y;sim.step({...stop,jump:true},firstStep);let peak=floor
  for(let n=0;n<90;n++){sim.step(stop,1/60);peak=Math.max(peak,sim.pose().y)}
  expect(peak-floor).toBeGreaterThan(1)
 }finally{sim.dispose()}
})
