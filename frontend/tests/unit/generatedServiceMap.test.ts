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

it('connects dev feedback, notes and minigame entry to the accepted map instead of legacy coordinates',()=>{
 const mailbox=PARK_DATA.interactions.mailbox.position,notes=PARK_DATA.interactions.notes.reachPosition,cart=PARK_LAYOUT.SITES.cart
 expect(canReachFeedback({x:mailbox[0],y:mailbox[1]+.8,z:mailbox[2],yaw:0})).toBe(true)
 expect(canReachNotes({x:notes[0],y:notes[1],z:notes[2],yaw:0})).toBe(true)
 expect(canReachNotes({x:notes[0],y:.8,z:notes[2],yaw:0})).toBe(false)
 expect(canReachBungeoppang({x:cart.x,y:.8,z:cart.z})).toBe(true)
 expect(BUNG_GRILL.center).toEqual([cart.x+FISH_CART_GRILL.center[0],FISH_CART_GRILL.surfaceY,cart.z+FISH_CART_GRILL.center[2]])
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
it('preserves the 16 BE mappings and leaves the two new VR server IDs for BE to assign',()=>{
  const received=JSON.parse(readFileSync('public/park-bindings.generated.frontend-test.json','utf8'))
  const canonical=JSON.parse(readFileSync('../docs/integration/park-180/park-bindings.frontend-test.json','utf8'))
  expect(received).toEqual(canonical)
  const bindings=parseBindings(received.bindings)
  for(const channel of ['channel-1','channel-2']) {
    const ids=bindings.filter(b=>b.channelId===channel).map(b=>b.tableId)
    expect(ids).toHaveLength(16)
    for(const table of map.TABLES.slice(0,16))expect(bindAnchor(bindings,channel,table.id,ids)).toBeTruthy()
    for(const id of ['table-17','table-18'])expect(bindAnchor(bindings,channel,id,ids)).toBeNull()
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
