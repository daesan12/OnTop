import {describe,it,expect} from 'vitest'
import {PARK_DATA,PARK_LAYOUT,PARK_DEFINITION,resolveParkLayout} from '../../src/map/park'
import {TELESCOPES} from '../../src/config/telescopes'
import {TOWER_SITE} from '../../src/config/parkPlan'

describe('park server physics and interaction contract',()=>{
  it('keeps the server solids independent of every preview movement clearance',()=>{
    const d=structuredClone(PARK_DEFINITION)
    for(const k of Object.keys(d.collision) as (keyof typeof d.collision)[])d.collision[k]*=1.1
    d.park.movementInset=2
    const changed=resolveParkLayout(d).data
    expect(changed.physics).toEqual(PARK_DATA.physics)
    expect(changed.collision).not.toEqual(PARK_DATA.collision)
    const shop=PARK_DATA.physics.boxes.find(b=>b.id==='layout-shop')!
    expect(shop.half).toEqual([PARK_DEFINITION.kiosks.shop.width/2,2.3,PARK_DEFINITION.kiosks.shop.depth/2])
    expect(shop.yaw).toBe(Math.PI/4)
    expect(PARK_DATA.physics.playerInflation).toBe(0)
    expect(PARK_DATA.physics.collisionMargin).toBe(0)
  })
  it('exports valid upward triangles and a regular first terrain mesh without a water lid',()=>{
    const p=PARK_DATA.physics,mesh=p.meshes[0]!,side=p.terrain.columns
    expect(mesh.id).toBe('terrain');expect(mesh.vertices.length).toBe(side*side*3)
    expect(mesh.indices.length).toBe((side-1)**2*6)
    for(const m of p.meshes) {
      expect(m.vertices.every(Number.isFinite)).toBe(true)
      expect(m.indices.length%3).toBe(0)
      expect(m.indices.every(n=>Number.isInteger(n)&&n>=0&&n<m.vertices.length/3)).toBe(true)
      for(let n=0;n<m.indices.length;n+=3) {
        const a=m.indices[n]!*3,b=m.indices[n+1]!*3,c=m.indices[n+2]!*3
        const upward=(m.vertices[b+2]!-m.vertices[a+2]!)*(m.vertices[c]!-m.vertices[a]!)-(m.vertices[b]!-m.vertices[a]!)*(m.vertices[c+2]!-m.vertices[a+2]!)
        expect(upward).toBeGreaterThan(0)
      }
    }
    const lakeIndex=((PARK_DEFINITION.lake.z+90)/2*side+(PARK_DEFINITION.lake.x+90)/2)*3
    expect(mesh.vertices[lakeIndex+1]).toBe(-2.8)
    const bridge=p.meshes.find(m=>m.id==='layout-wood-bridge')!
    expect(Math.max(...bridge.vertices.filter((_,n)=>n%3===1))).toBeCloseTo(1.97)
    const stones=p.hulls.filter(h=>h.id.startsWith('layout-stone-bridge-stone-'))
    expect(stones.length).toBeGreaterThan(10)
    expect(stones[1]!.vertices[0]!-stones[0]!.vertices[0]!).toBeGreaterThan(0)
  })
  it('exports stairs on all four sides and moves the observation meshes with the tower',()=>{
    for(const axis of ['x','z'])for(const sign of [-1,1]) {
      const stairs=PARK_DATA.physics.boxes.filter(b=>b.id.startsWith(`pagoda-step-${axis}-${sign}-`))
      expect(stairs).toHaveLength(PARK_DEFINITION.pagoda.steps)
      expect(stairs.at(-1)!.center[1]+stairs.at(-1)!.half[1]).toBeCloseTo(1.8)
    }
    const d=structuredClone(PARK_DEFINITION);d.sites.tower.x-=3;d.sites.tower.z+=2
    const changed=resolveParkLayout(d).data
    const old=PARK_DATA.physics.meshes.find(m=>m.id==='tower-ramp')!,next=changed.physics.meshes.find(m=>m.id==='tower-ramp')!
    expect(next.indices).toEqual(old.indices)
    expect(next.vertices[0]).toBeCloseTo(old.vertices[0]!-3)
    expect(next.vertices[2]).toBeCloseTo(old.vertices[2]!+2)
    const telescope=changed.interactions.telescopes[0]!,before=PARK_DATA.interactions.telescopes[0]!
    expect(telescope.id).toBe(TELESCOPES[0]!.id)
    expect(telescope.use.x).toBeCloseTo(before.use.x-3);expect(telescope.exit.z).toBeCloseTo(before.exit.z+2)
    expect(telescope.position[0]).toBeCloseTo(TELESCOPES[0]!.position[0]-TOWER_SITE.x+d.sites.tower.x)
  })
  it('keeps IDs and directions attached to moved fixtures, with table-local seats intact',()=>{
    const d=structuredClone(PARK_DEFINITION);d.pavilions.P1=[-27,5];d.sites.fitness.x+=2;d.sites.fitness.z-=3
    const changed=resolveParkLayout(d).data
    for(const kind of ['benches','fitness','telescopes'] as const)expect(changed.interactions[kind].map(x=>x.id)).toEqual(PARK_DATA.interactions[kind].map(x=>x.id))
    const before=PARK_DATA.interactions.benches.find(b=>b.siteId==='bench-P1-bay-0')!,after=changed.interactions.benches.find(b=>b.id===before.id)!
    expect(before.id).toMatch(/^bench-\d+$/)
    expect(after.seats[0]!.use.x-before.seats[0]!.use.x).toBeCloseTo(-3)
    expect(after.seats[0]!.exit.z-before.seats[0]!.exit.z).toBeCloseTo(1)
    const f=changed.interactions.fitness[0]!,old=PARK_DATA.interactions.fitness[0]!
    expect(f.use.x-old.use.x).toBeCloseTo(2);expect(f.exit.z-old.exit.z).toBeCloseTo(-3)
    expect(changed.tables.map(t=>[t.id,t.seatAnchors])).toEqual(PARK_DATA.tables.map(t=>[t.id,t.seatAnchors]))
    expect(JSON.stringify(changed)).not.toContain('spectatorRadius')
  })
  it('makes fitness ring seats face away from the tree and exports a capsule-centred spawn',()=>{
    for(const b of PARK_DATA.interactions.benches.filter(b=>b.id.startsWith('bench-fitness-ring-'))) {
      const p=b.seats[0]!,dx=p.exit.x-b.position[0],dz=p.exit.z-b.position[2]
      expect(dx*(b.position[0]-PARK_DEFINITION.sites.fitness.x)+dz*(b.position[2]-PARK_DEFINITION.sites.fitness.z)).toBeGreaterThan(0)
    }
    const s=PARK_DATA.physics.spawn
    expect(s.origin).toBe('capsule-center');expect(s.position[1]).toBeCloseTo(.84)
    expect([s.position[0],s.position[2]]).toEqual([0,82])
    expect(PARK_LAYOUT.canWalk(s.position[0],s.position[2])).toBe(true)
  })
  it('rejects invalid terrain sampling rather than silently changing grid spacing',()=>{
    const d=structuredClone(PARK_DEFINITION);d.physics.terrainStep=7
    expect(()=>resolveParkLayout(d)).toThrow(/terrainStep/)
  })
})
