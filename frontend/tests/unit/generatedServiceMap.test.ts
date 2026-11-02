import {afterAll,expect,it,vi} from 'vitest'
import {readFileSync} from 'node:fs'
vi.stubEnv('VITE_PARK_MAP','generated')
vi.stubEnv('MODE','park-integration')
vi.resetModules()
const map=await import('../../src/park/mapConfig')
const {PARK_DATA,PARK_LAYOUT}=await import('../../src/map/park')
const {LIVE_MAP_IDENTITY}=await import('../../src/network/mapContract')
const {canReachTable}=await import('../../src/features/tableLobby/tableReach')
const {packagedParkBindings}=await import('../../src/park/runtime/deployment')
const {PARK_MAP_VERSION}=await import('../../src/map/park/generated/mapVersion')
const {canReachFeedback}=await import('../../src/features/feedback/validation')
const {canReachNotes}=await import('../../src/features/notes/validation')
const {canReachBungeoppang}=await import('../../src/features/bungeoppang/access')
const {BUNG_GRILL}=await import('../../src/features/bungeoppang/bungeoppangView')
const {FISH_CART_GRILL}=await import('../../src/config/fishCart')
const {benchAnchors}=await import('../../src/features/interactions/benchAnchors')
const {parseBindings,bindAnchor}=await import('../../src/network/tableBindings')
const {PARK_DESTINATIONS,findParkRoute,navigationSegmentClear}=await import('../../src/features/navigation/parkNavigation')
afterAll(()=>vi.unstubAllEnvs())

it('replaces the back massage slot with a second inversion station and matching use/exit poses',async()=>{
 const legacy=await import('../../src/config/fitness')
 const {fitnessAnchors,findFitness}=await import('../../src/features/fitness/anchors')
 expect(map.FITNESS_STATIONS).toHaveLength(legacy.FITNESS_STATIONS.length)
 expect(map.FITNESS_STATIONS.map(s=>s.id)).toEqual(legacy.FITNESS_STATIONS.map(s=>s.id))
 expect(map.FITNESS_STATIONS.filter(s=>s.kind==='inversion')).toHaveLength(2)
 expect(map.FITNESS_STATIONS.some(s=>s.kind==='backmassage')).toBe(false)
 const first=map.FITNESS_STATIONS.find(s=>s.id==='inversion')!,second=findFitness('backmassage')!
 expect(second).toMatchObject({kind:'inversion',name:'거꾸로 매달리기 2',baseHeight:first.baseHeight,instruction:first.instruction})
 const index=legacy.FITNESS_STATIONS.findIndex(s=>s.id==='backmassage'),angle=(index+.5)*Math.PI*2/legacy.FITNESS_STATIONS.length
 expect(second.position).toEqual([PARK_LAYOUT.SITES.fitness.x+Math.cos(angle)*PARK_LAYOUT.SETTINGS.fitness.stationRadius,0,PARK_LAYOUT.SITES.fitness.z+Math.sin(angle)*PARK_LAYOUT.SETTINGS.fitness.stationRadius])
 const anchors=fitnessAnchors(second.id),server=PARK_DATA.interactions.fitness.find(s=>s.id===second.id)!
 expect(anchors).toEqual({use:server.use,exit:server.exit})
 expect(anchors.use.y).toBeCloseTo(second.position[1]+.68+.8)
 const motion=map.createFitnessMotion()
 map.sampleFitnessMotion(second.kind,1000,2200,motion)
 expect(motion.bodyX).toBeLessThan(-1)
 expect(motion.mechanism).toBe(motion.bodyX)
})

it('keeps every workout station concentric with the tree, facing it, with safe use/exit and collider alignment',()=>{
 const center=PARK_LAYOUT.SITES.fitness,radius=PARK_LAYOUT.SETTINGS.fitness.stationRadius,stations=map.FITNESS_STATIONS
 const chord=2*radius*Math.sin(Math.PI/stations.length)
 for(const [i,s] of stations.entries()){
  const dx=center.x-s.position[0],dz=center.z-s.position[2]
  expect(Math.hypot(dx,dz),s.id+' tree distance').toBeCloseTo(radius)
  expect(s.position[0]+Math.sin(s.yaw)*radius,s.id+' facing X').toBeCloseTo(center.x)
  expect(s.position[2]+Math.cos(s.yaw)*radius,s.id+' facing Z').toBeCloseTo(center.z)
  const next=stations[(i+1)%stations.length]!
  expect(Math.hypot(next.position[0]-s.position[0],next.position[2]-s.position[2]),s.id+' neighbour spacing').toBeCloseTo(chord)
  const collider=PARK_DATA.physics.boxes.find(b=>b.id===s.id)!,interaction=PARK_DATA.interactions.fitness.find(f=>f.id===s.id)!
  expect([collider.center[0],collider.center[2],collider.yaw]).toEqual([s.position[0],s.position[2],s.yaw])
  expect(interaction.yaw).toBe(s.yaw)
  expect(PARK_LAYOUT.canWalk(interaction.exit.x,interaction.exit.z),s.id+' dismount').toBe(true)
  const inwardX=s.position[0]+Math.sin(s.yaw)*map.FITNESS.exitOffset,inwardZ=s.position[2]+Math.cos(s.yaw)*map.FITNESS.exitOffset
  expect(PARK_LAYOUT.canWalk(inwardX,inwardZ),s.id+' inner approach').toBe(true)
 }
})

it('connects dev feedback, notes and minigame entry to the accepted map instead of legacy coordinates',()=>{
 const mailbox=PARK_DATA.interactions.mailbox.position,notes=PARK_DATA.interactions.notes.reachPosition,cart=PARK_LAYOUT.SITES.cart
 expect(canReachFeedback({x:mailbox[0],y:mailbox[1]+.8,z:mailbox[2],yaw:0})).toBe(true)
 expect(canReachNotes({x:notes[0],y:notes[1],z:notes[2],yaw:0})).toBe(true)
 expect(canReachNotes({x:notes[0],y:.8,z:notes[2],yaw:0})).toBe(false)
 const serving=PARK_DESTINATIONS.mini!
 expect(canReachBungeoppang({...serving,y:.8})).toBe(true)
 expect(canReachBungeoppang({x:cart.x,y:.8,z:cart.z})).toBe(false)
 expect(BUNG_GRILL.center).toEqual([cart.x+FISH_CART_GRILL.center[0],FISH_CART_GRILL.surfaceY,cart.z+FISH_CART_GRILL.center[2]])
})

it('scales the sound box and its collision footprint together while keeping its front usable',()=>{
 const scale=PARK_LAYOUT.SETTINGS.mailbox.scale,box=PARK_DATA.physics.boxes.find(b=>b.id==='feedback-mailbox')!
 expect(scale).toBe(1.9)
 expect(map.MAILBOX.height).toBeCloseTo(3.42)
 expect(box.center).toEqual([map.MAILBOX.x,map.MAILBOX.height/2,map.MAILBOX.z])
 expect(box.half).toEqual([map.MAILBOX.bodyHalfWidth,map.MAILBOX.height/2,map.MAILBOX.bodyHalfDepth])
 expect(box.yaw).toBe(PARK_LAYOUT.SETTINGS.mailbox.yaw)
 const front=PARK_DESTINATIONS.mailbox!
 expect(PARK_LAYOUT.canWalk(front.x,front.z)).toBe(true)
 expect(canReachFeedback({...front,y:.8,yaw:box.yaw+Math.PI})).toBe(true)
})

it('selects the same generated scene placements and identity used by the server handoff',()=>{
  expect(LIVE_MAP_IDENTITY).toEqual({mapId:'park',schemaVersion:2,mapVersion:PARK_MAP_VERSION})
  expect(map.WORLD.halfSize).toBe(90);expect(map.PARK_SIZE).toBe(180)
  expect(map.TABLES).toEqual(PARK_LAYOUT.DRAFT_TABLES)
  expect(map.MAILBOX).toMatchObject(PARK_LAYOUT.SITES.mailbox)
  expect([map.NOTES_BOX.x,map.NOTES_BOX.y,map.NOTES_BOX.z]).toEqual(PARK_DATA.interactions.notes.position)
  expect(benchAnchors.map(b=>b.id)).toEqual(PARK_DATA.interactions.benches.map(b=>b.id))
  for(const b of benchAnchors)expect(b.seats).toEqual(PARK_DATA.interactions.benches.find(x=>x.id===b.id)!.seats.map(s=>s.use))
  for(const t of map.TELESCOPES) {
    const expected=PARK_DATA.interactions.telescopes.find(x=>x.id===t.id)!.exit
    expect(map.telescopeLanding(t,true)).toEqual([expected.x,expected.y,expected.z])
  }
})
it('matches all 18 accepted BE mappings while preserving existing server IDs',()=>{
  const received=JSON.parse(readFileSync('public/park-bindings.generated.frontend-test.json','utf8'))
  const canonical=JSON.parse(readFileSync('../docs/integration/park-180/park-bindings.frontend-test.json','utf8'))
  expect(received).toEqual(canonical)
  const bindings=parseBindings(received.bindings)
  for(const channel of ['channel-1','channel-2']) {
    const ids=bindings.filter(b=>b.channelId===channel).map(b=>b.tableId)
    expect(ids).toHaveLength(18)
    for(const table of map.TABLES)expect(bindAnchor(bindings,channel,table.id,ids)).toBeTruthy()
  }
  expect(JSON.parse(readFileSync('public/park-bindings.frontend-test.json','utf8')).bindings).toHaveLength(4)
})
it.each(Object.entries(PARK_DESTINATIONS))('finds a collision-clear approach from the new spawn to %s',(_id,destination)=>{
  const path=findParkRoute({x:PARK_DATA.world.spawn[0],z:PARK_DATA.world.spawn[1]},destination)
  expect(path).not.toBeNull()
  for(let n=1;n<path!.length;n++)expect(navigationSegmentClear(path![n-1]!,path![n]!)).toBe(true)
})
it('allows navigation across both generated lake crossings',()=>{
  for(const c of PARK_LAYOUT.lake.CROSSINGS) {
    const path=findParkRoute({x:c.startX-1,z:c.z},{x:c.endX+1,z:c.z})
    expect(path,c.id).not.toBeNull()
  }
})

it('uses generated anchors for the new tablet and keeps legacy packaged bindings out of generated builds',()=>{
  expect(packagedParkBindings(false,'dev.on-top.world')).toBeUndefined()
  const table=map.TABLES.find(t=>t.id==='table-16')!
  expect(canReachTable({x:table.position[0],y:table.position[1]+.8,z:table.position[2]},table.id)).toBe(true)
  expect(canReachTable({x:0,y:.8,z:0},table.id)).toBe(false)
})
