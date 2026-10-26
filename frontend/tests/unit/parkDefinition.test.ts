import { describe,it,expect } from 'vitest'
import { PARK_DEFINITION,PARK_LAYOUT,PARK_DATA,resolveParkLayout } from '../../src/map/park'
import { isWalkable } from '../../src/map/park/collision'
import { TABLES } from '../../src/config/world'
const clone=()=>structuredClone(PARK_DEFINITION)
describe('common park definition',()=>{
  it('can be resolved without a DOM and serialized for the next generator step',()=>{
    expect(typeof document).toBe('undefined')
    const json=JSON.parse(JSON.stringify(PARK_DATA))
    expect(json.metadata).toMatchObject({schemaVersion:2,mapId:'park',stage:'preview',north:'-Z',up:'Y',unit:'metre'})
    expect(json.collision.obstacles.length).toBeGreaterThan(200)
    expect(new Set(json.collision.obstacles.map((o:{kind:string})=>o.kind))).toEqual(new Set(['box','circle','segment','annular-sector']))
    for(const [x,z] of [[0,82],[10,35],[-29,35],[62,-14],[89,0]])expect(isWalkable(json.collision,x!,z!)).toBe(PARK_LAYOUT.canWalk(x!,z!))
    expect(json.tables.map((t:{id:string})=>t.id)).toEqual(TABLES.map(t=>t.id))
    expect(json.facilities.find((f:{id:string})=>f.id==='layout-drink').kind).toBe('drink')
    expect(json.interactions.tableSeats[0].localSeats).toEqual(TABLES[0]!.seatAnchors)
  })
  it('moves a rotated shop, its close fence, marker and collision together',()=>{
    const d=clone();d.sites.shop={x:10,z:65};d.kiosks.shop.yaw=0;d.kiosks.shop.width=12
    const map=resolveParkLayout(d),shop=map.KIOSKS.find(k=>k.kind==='shop')!
    expect(map.MARKERS.find(m=>m.id==='layout-shop')).toMatchObject({x:10,z:65})
    expect(map.data.facilities.find(f=>f.id==='layout-shop')).toMatchObject({position:[10,0,65],yaw:0})
    expect(map.KIOSK_FENCE_RUNS.find(f=>f.id==='kiosk-shop-0')).toMatchObject({from:[3.5,60.9],to:[16.5,60.9]})
    expect(map.canWalk(shop.x+5.8,shop.z)).toBe(false)
    expect(PARK_LAYOUT.canWalk(shop.x+5.8,shop.z)).toBe(true)
    expect(map.COLLISION.obstacles.filter(o=>o.id==='layout-shop')).toHaveLength(1)
    expect(map.COLLISION.obstacles.find(o=>o.id==='layout-shop')).toMatchObject({halfX:6.3,yaw:0})
  })
  it('keeps table identity and local seats attached when a pavilion moves',()=>{
    const d=clone();d.pavilions.P1=[-24,0]
    const map=resolveParkLayout(d),table=map.DRAFT_TABLES.find(t=>t.pavilionId==='P1')!,old=TABLES.find(t=>t.id===table.id)!
    expect(table.position).toEqual([-24,.72,0]);expect(table.seatAnchors).toEqual(old.seatAnchors)
    expect(map.FENCE_COURTS.find(f=>f.id==='court-P1')).toMatchObject({x:-24,z:0})
    expect(map.COLLISION.obstacles.find(o=>o.id===table.id)).toMatchObject({x:-24,z:0})
    expect(map.DRAFT_STAIRS.find(p=>p.id==='P1')).toMatchObject({x:-24,z:0})
  })
  it('moves the lake, crossings, fishing surfaces and shore collision from one definition',()=>{
    const d=clone();d.lake.x-=2;d.lake.z-=3;d.lake.rx=16
    const map=resolveParkLayout(d),lake=map.lake
    expect(lake.CROSSINGS[0]!.z).toBe(-29)
    expect(map.SITES.fishing).toEqual({x:47,z:-46})
    expect(lake.FISHING_RAILS[0]!.from[1]).toBeCloseTo(-48.82)
    expect(map.walkHeight(47,-46)).toBe(.32)
    expect(lake.swimmingAt(60,-17)).toBe(true)
    for(const rail of lake.SHORE_RUNS)expect(isWalkable(map.COLLISION,(rail.from[0]+rail.to[0])/2,(rail.from[1]+rail.to[1])/2)).toBe(false)
  })
  it('moves the central pagoda height, four stairs and rail collision together',()=>{
    const d=clone();d.sites.pagoda.x=18
    const map=resolveParkLayout(d)
    expect(map.walkHeight(18,-40)).toBe(1.8)
    expect(map.walkHeight(-10,-40)).toBe(0)
    expect(map.walkHeight(34,-40)).toBeCloseTo(.54)
    expect(map.CENTRAL_RAIL_RUNS[0]!.from[0]).toBe(PARK_LAYOUT.CENTRAL_RAIL_RUNS[0]!.from[0]+18)
    expect(map.DRAFT_BOXES.find(o=>o.id==='garden-pagoda')!.x).toBe(18)
  })
  it('changes the playable boundary and wall location without scaling facility coordinates',()=>{
    const d=clone();d.park.size=200
    const map=resolveParkLayout(d)
    expect(map.MAIN_GATE.z).toBe(100);expect(map.COLLISION.boundary.half).toBe(98.8)
    expect(map.canWalk(95,0)).toBe(true);expect(PARK_LAYOUT.canWalk(95,0)).toBe(false)
    expect(map.SITES.shop).toEqual(PARK_LAYOUT.SITES.shop)
  })
  it.each([
    ['non-finite coordinate',(d:ReturnType<typeof clone>)=>{d.sites.cart.x=NaN},/finite/],
    ['negative dimension',(d:ReturnType<typeof clone>)=>{d.kiosks.photo.width=-1},/positive/],
    ['duplicate route',(d:ReturnType<typeof clone>)=>{d.routes=[...d.routes,d.routes[0]!]},/duplicate/],
    ['out-of-bounds facility',(d:ReturnType<typeof clone>)=>{d.sites.shop.x=1000},/outside/],
    ['missing pavilion',(d:ReturnType<typeof clone>)=>{delete d.pavilions.P2},/preserve existing IDs/],
    ['missing table',(d:ReturnType<typeof clone>)=>{delete d.tables['table-1']},/preserve existing IDs/],
    ['blocked spawn',(d:ReturnType<typeof clone>)=>{d.park.spawn=[d.sites.cart.x,d.sites.cart.z]},/spawn is blocked/],
    ['inconsistent gate',(d:ReturnType<typeof clone>)=>{d.gate.boundaryOpening=8},/must align/],
  ])('rejects %s before rendering',(_,change,message)=>{
    const d=clone();change(d);expect(()=>resolveParkLayout(d)).toThrow(message)
  })
})
