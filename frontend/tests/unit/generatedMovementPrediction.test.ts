import { afterAll, expect, it, vi } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';

vi.stubEnv('VITE_PARK_MAP', 'generated');
vi.stubEnv('MODE', 'park-integration');
vi.resetModules();
const { PARK_DATA } = await import('../../src/map/park');
const { createPredictionPhysics } = await import('../../src/network/predictionPhysics');
const { addGeneratedPredictionColliders } = await import('../../src/network/predictionMap');
afterAll(() => vi.unstubAllEnvs());

it.each([undefined,'PARK_V1'] as const)('blocks running and jumping onto the fountain with profile %s from all four sides',async(profile)=>{
 const simulation=await createPredictionPhysics(profile),f=PARK_DATA.physics.fountainPolicy
 const {PARK_LAYOUT}=await import('../../src/map/park')
 try {
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]])for(const jump of [false,true]) {
   const x=f.x-dx!*9,z=f.z-dz!*9
   simulation.reset({x,y:PARK_LAYOUT.walkHeight(x,z)+.84,z,yaw:0},0,false)
   for(let n=0;n<30;n++)simulation.step({dx:0,dz:0,run:false,jump:false},1/60)
   for(let n=0;n<120;n++) {
    simulation.step({dx:dx!,dz:dz!,run:true,jump:jump&&n%35===0},1/60)
    const p=simulation.pose()
    expect(Math.hypot(p.x-f.x,p.z-f.z)).toBeGreaterThan(f.radius+.25)
   }
   const p=simulation.pose()
   expect(p.y).toBeLessThan(f.top)
   expect(PARK_LAYOUT.canWalk(x,z)).toBe(true)
  }
 }finally{simulation.dispose()}
})

it.each([undefined,'PARK_V1'] as const)('cannot remain on the fountain after a high fall or recovery with profile %s',async(profile)=>{
 const simulation=await createPredictionPhysics(profile),f=PARK_DATA.physics.fountainPolicy
 try {
  for(const y of [12,0]) {
   simulation.reset({x:f.x,y,z:f.z,yaw:0},-2,false)
   for(let n=0;n<300;n++)simulation.step({dx:0,dz:0,run:false,jump:false},1/60)
   const p=simulation.pose()
   expect(Math.hypot(p.x-f.x,p.z-f.z)).toBeGreaterThan(f.radius+.25)
   expect(p.y).toBeLessThan(f.top)
  }
 }finally{simulation.dispose()}
})

it('keeps prediction inside the new park instead of clamping its spawn to the legacy park', async () => {
  const simulation = await createPredictionPhysics();
  try {
    const [x, y, z] = PARK_DATA.physics.spawn.position;
    simulation.reset({ x, y, z, yaw: Math.PI }, 0, true);
    for (let i = 0; i < 60; i++) simulation.step({ dx: 0, dz: -1, run: false, jump: false }, 1 / 60);
    const pose = simulation.pose();
    expect(pose.x).toBeCloseTo(x, 2);
    expect(pose.z).toBeLessThan(z - 4);
    expect(pose.z).toBeGreaterThan(z - 8);
    expect(pose.y).toBeGreaterThan(.7);
    expect(pose.y).toBeLessThan(1);
  } finally { simulation.dispose(); }
});

it('uses uninflated handoff shapes and server chair numbers at the new VR table', async () => {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  try {
    const chairs = addGeneratedPredictionColliders(world);
    expect(world.colliders.len()).toBe(PARK_DATA.physics.boxes.length + PARK_DATA.physics.meshes.length + PARK_DATA.physics.hulls.length);
    const chair = chairs.find(c => c.anchor === 'table-17' && c.number === 3)!;
    const box = PARK_DATA.physics.boxes.find(b => b.id === 'table-17-chair-2')!;
    expect(chair.collider.isEnabled()).toBe(false);
    chair.collider.setEnabled(true);
    const actual = chair.collider.halfExtents();
    if (!actual) throw new Error('The handoff chair must remain a cuboid.');
    expect(actual.x).toBeCloseTo(box.half[0], 6);
    expect(actual.y).toBeCloseTo(box.half[1], 6);
    expect(actual.z).toBeCloseTo(box.half[2], 6);
    const position = chair.collider.translation();
    expect([position.x, position.y, position.z]).toEqual(box.center.map(v => Math.fround(v)));
  } finally { world.free(); }
});

it('registers the configured landing collider instead of assuming a specific map floor', async () => {
  await RAPIER.init();
  const court = PARK_DATA.physics.boxes.find(box => box.id === 'vr-court-floor')!;
  const landing = { ...court, id: 'new-course-landing', center: [8, 0, 4] as typeof court.center };
  const physics = { ...PARK_DATA.physics, boxes: [court, landing], meshes: [], hulls: [] };
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  try {
    const supports = new Set<RAPIER.Collider>();
    addGeneratedPredictionColliders(world, physics, undefined, { colliderIds: [landing.id], supports });
    expect([...supports].map(collider => collider.translation().x)).toEqual([8]);
    expect(() => addGeneratedPredictionColliders(world, physics, undefined, {
      colliderIds: ['missing-landing'], supports: new Set(),
    })).toThrow('missing-landing');
  } finally { world.free(); }
});

it.each([undefined,'PARK_V1'] as const)('blocks walking and jumps through pavilion furniture with profile %s without changing its seats',async(profile)=>{
 const simulation=await createPredictionPhysics(profile)
 try {
  const table=PARK_DATA.tables.find(t=>t.pavilionId==='P1')!,box=PARK_DATA.physics.boxes.find(b=>b.id===table.id+'-top')!
  simulation.setChairs(new Map(PARK_DATA.tables.map(t=>[t.id,0])))
  for(const jumping of [false,true]) {
   simulation.reset({x:table.position[0]-box.half[0]-1.2,y:table.position[1]+.8,z:table.position[2],yaw:Math.PI/2},0,true)
   for(let n=0;n<100;n++)simulation.step({dx:1,dz:0,run:true,jump:jumping&&n===0},1/60)
   const pose=simulation.pose()
   expect(pose.x).toBeLessThan(table.position[0]-box.half[0]-.28)
   expect(pose.y).toBeLessThan(table.position[1]+1)
  }
 } finally{simulation.dispose()}
})

it.each([undefined,'PARK_V1'] as const)('allows a jump over the finite pavilion rail and bench with profile %s but blocks walking',async(profile)=>{
 const simulation=await createPredictionPhysics(profile)
 try {
  const p=PARK_DATA.pavilions.find(p=>p.id==='P5')!,a=Math.PI/4
  const normal={x:Math.cos(a),z:Math.sin(a)},face=3.65*p.scale*Math.cos(Math.PI/8)
  const start={x:p.x+normal.x*(face-1.7),y:p.floor+.8,z:p.z+normal.z*(face-1.7),yaw:a}
  simulation.setChairs(new Map(PARK_DATA.tables.map(t=>[t.id,0])))
  const travel=(jump:boolean)=>{simulation.reset(start,0,true);for(let n=0;n<10;n++)simulation.step({dx:normal.x,dz:normal.z,run:false,jump:false},1/60);for(let n=0;n<60;n++)simulation.step({dx:normal.x,dz:normal.z,run:false,jump:jump&&n===0},1/60);const at=simulation.pose();return (at.x-p.x)*normal.x+(at.z-p.z)*normal.z}
  expect(travel(false)).toBeLessThan(face)
  expect(travel(true)).toBeGreaterThan(face+.4)
 }finally{simulation.dispose()}
})

it.each([undefined,'PARK_V1'] as const)('slides off furniture after a high fall with profile %s instead of standing on its invisible top',async(profile)=>{
 const simulation=await createPredictionPhysics(profile)
 try {
  const table=PARK_DATA.tables.find(t=>t.pavilionId==='P1')!
  simulation.setChairs(new Map(PARK_DATA.tables.map(t=>[t.id,0])))
  simulation.reset({x:table.position[0],y:table.position[1]+5,z:table.position[2],yaw:0},-2,false)
  for(let n=0;n<150;n++)simulation.step({dx:0,dz:0,run:false,jump:false},1/60)
  const pose=simulation.pose()
  expect(pose.y).toBeLessThan(table.position[1]+1)
  expect(Math.hypot(pose.x-table.position[0],pose.z-table.position[2])).toBeGreaterThan(1)
 }finally{simulation.dispose()}
})


it('keeps PARK_V1 selected through generated water buoyancy and a return to normal ground',async()=>{
 const sim=await createPredictionPhysics('PARK_V1'),stop={dx:0,dz:0,run:false,jump:false}
 const {groundHeight,lakeRadiusAt,LAKE:water,SWIMMING}=await import('../../src/park/mapConfig')
 try{
  const point=[-5,0,5].flatMap(dx=>[-8,0,8].map(dz=>({x:water.x+dx,z:water.z+dz}))).find(p=>lakeRadiusAt(p.x,p.z)<.7&&water.surfaceY-groundHeight(p.x,p.z)>1)!
  expect(point).toBeTruthy();const floatY=water.surfaceY+SWIMMING.floatOffset
  sim.reset({...point,y:floatY-.2,yaw:0},0,false)
  for(let n=0;n<120;n++)sim.step(stop,1/60)
  expect(sim.pose().y).toBeCloseTo(floatY,2)
  sim.reset({x:0,y:.84,z:82,yaw:0},0,true)
  for(let n=0;n<60;n++)sim.step(stop,1/60)
  const start=sim.pose();for(let n=0;n<60;n++)sim.step({...stop,dz:-1,run:true},1/60)
  expect(start.z-sim.pose().z).toBeGreaterThan(7)
 }finally{sim.dispose()}
})
it('walks the generated tower spiral with the same PARK_V1 controller',async()=>{
 const sim=await createPredictionPhysics('PARK_V1'),tower=PARK_DATA.physics.tower,radius=(tower.inner+tower.outer)/2
 try{
  sim.reset({x:tower.x+radius,y:tower.surfaceOffset+.84,z:tower.z,yaw:0},0,false)
  for(let n=0;n<45;n++)sim.step({dx:0,dz:0,run:false,jump:false},1/60)
  const start=sim.pose()
  for(let n=0;n<540;n++){
   const p=sim.pose(),angle=Math.atan2(p.z-tower.z,p.x-tower.x)+.08
   const dx=tower.x+radius*Math.cos(angle)-p.x,dz=tower.z+radius*Math.sin(angle)-p.z,length=Math.hypot(dx,dz)
   sim.step({dx:dx/length,dz:dz/length,run:false,jump:false},1/60)
   expect([sim.pose().x,sim.pose().y,sim.pose().z].every(Number.isFinite)).toBe(true)
  }
  expect(sim.pose().y-start.y).toBeGreaterThan(2)
 }finally{sim.dispose()}
})
it('can enter and leave the generated shallow lake opening without changing PARK_V1',async()=>{
 const {LAKE,SWIMMING,groundHeight,lakeRadiusAt}=await import('../../src/park/mapConfig')
 const sim=await createPredictionPhysics('PARK_V1'),stop={dx:0,dz:0,run:false,jump:false},x=LAKE.x+LAKE.radiusX+2,z=LAKE.z
 try{
  sim.reset({x,y:groundHeight(x,z)+.84,z,yaw:0},0,false)
  for(let n=0;n<60;n++)sim.step(stop,1/60)
  let entered=false,exited=false
  for(let n=1;n<=600;n++){
   sim.step({...stop,dx:n<=240?-1:1,run:true},1/60)
   const p=sim.pose(),wet=lakeRadiusAt(p.x,p.z)<1&&LAKE.surfaceY-groundHeight(p.x,p.z)>SWIMMING.depthThreshold&&p.y<LAKE.surfaceY+.4
   entered ||=wet;exited ||=entered&&!wet
  }
  expect(entered).toBe(true);expect(exited).toBe(true);expect(sim.pose().y).toBeGreaterThan(.7)
 }finally{sim.dispose()}
})
