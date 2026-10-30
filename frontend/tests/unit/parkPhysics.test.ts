import {describe,it,expect} from 'vitest'
import {PARK_DATA,PARK_LAYOUT,PARK_DEFINITION,resolveParkLayout} from '../../src/map/park'
import {TELESCOPES} from '../../src/config/telescopes'
import {TOWER_SITE} from '../../src/config/parkPlan'
import {OBSERVATION_TOWER} from '../../src/config/parkLayout'
import {NOTES_BOX} from '../../src/config/notes'
import {canReachNotes} from '../../src/features/notes/validation'

describe('park server physics and interaction contract',()=>{
  it('keeps the server solids independent of every preview movement clearance',()=>{
    const d=structuredClone(PARK_DEFINITION)
    for(const k of Object.keys(d.collision) as (keyof typeof d.collision)[])d.collision[k]*=1.1
    d.park.movementInset=2
    const changed=resolveParkLayout(d).data
    expect(changed.physics).toEqual(PARK_DATA.physics)
    expect(changed.collision).not.toEqual(PARK_DATA.collision)
    const shop=PARK_DATA.physics.boxes.find(b=>b.id==='layout-shop')!
    expect(shop.half).toEqual([PARK_DEFINITION.kiosks.shop.width/2,2.15,PARK_DEFINITION.kiosks.shop.depth/2])
    expect(shop.yaw).toBe(PARK_DEFINITION.kiosks.shop.yaw)
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
    const d=structuredClone(PARK_DEFINITION);d.pavilions.P1=[d.pavilions.P1![0]-3,d.pavilions.P1![1]+1];d.sites.fitness.x+=2;d.sites.fitness.z-=3
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
  it('exports the anonymous notes reach origin on the new tower separately from the sound mailbox',()=>{
    const notes=PARK_DATA.interactions.notes
    expect(notes.position).toEqual([PARK_DEFINITION.sites.tower.x-1.5,OBSERVATION_TOWER.height+.12,PARK_DEFINITION.sites.tower.z-1.5])
    expect(notes.radius).toBe(NOTES_BOX.interactionRadius)
    expect(notes.heightTolerance).toBe(.7)
    expect(notes.heightReference).toBe('legacy-avatar-origin')
    expect(notes.radiusComparison).toBe('less-than-or-equal');expect(notes.heightComparison).toBe('strict-less-than')
    expect(notes.reachPosition[1]).toBeCloseTo(notes.position[1]+.8)
    expect(notes.position).not.toEqual(PARK_DATA.interactions.mailbox.position)
    // Translate exported reach samples back to the existing service fixture and compare actual FE admission.
    const reachable=(distance:number,height:number)=>canReachNotes({x:NOTES_BOX.x+distance,y:notes.reachPosition[1]+height,z:NOTES_BOX.z,yaw:0})
    expect(reachable(notes.radius-.01,0)).toBe(true);expect(reachable(notes.radius+.01,0)).toBe(false)
    expect(reachable(0,.69)).toBe(true);expect(reachable(0,.71)).toBe(false)
    const d=structuredClone(PARK_DEFINITION);d.sites.tower.x-=3;d.sites.tower.z+=2
    const moved=resolveParkLayout(d).data.interactions.notes
    expect(moved.id).toBe(notes.id);expect(moved.position[0]).toBeCloseTo(notes.position[0]-3)
    expect(moved.reachPosition[2]).toBeCloseTo(notes.reachPosition[2]+2)
  })
  it('exports tower movement parameters consistent with the spiral mesh and moved site',()=>{
    const t=PARK_DATA.physics.tower,mesh=PARK_DATA.physics.meshes.find(m=>m.id==='tower-ramp')!
    expect(t).toMatchObject({x:62,z:56,inner:5,outer:8,height:18,turns:3,surfaceOffset:.12,topY:18.12})
    for(const n of [0,90,180,270,360]) {
      const k=n*6,angle=n/t.segments*Math.PI*2*t.turns
      expect(mesh.vertices[k]).toBeCloseTo(t.x+Math.cos(angle)*t.inner)
      expect(mesh.vertices[k+1]).toBeCloseTo(t.surfaceOffset+n/t.segments*t.height)
      expect(mesh.vertices[k+2]).toBeCloseTo(t.z+Math.sin(angle)*t.inner)
    }
    const d=structuredClone(PARK_DEFINITION);d.sites.tower.x-=3;d.sites.tower.z+=2
    expect(resolveParkLayout(d).data.physics.tower).toEqual({...t,x:59,z:58})
  })
  it('exports every stepping stone with exact uninflated hull bounds and translates with its lake',()=>{
    const p=PARK_DATA.physics,stones=p.steppingStones
    expect(stones).toHaveLength(p.hulls.filter(h=>h.id.startsWith('layout-stone-bridge-stone-')).length)
    expect(stones.length).toBeGreaterThan(10)
    for(const s of stones) {
      const hull=p.hulls.find(h=>h.id===s.id)!
      const x=hull.vertices.filter((_,n)=>n%3===0),y=hull.vertices.filter((_,n)=>n%3===1),z=hull.vertices.filter((_,n)=>n%3===2)
      expect(s.top).toBe(Math.max(...y));expect(s.bottom).toBe(Math.min(...y));expect(s.height).toBeCloseTo(.62)
      expect(s.x-s.width/2).toBeCloseTo(Math.min(...x));expect(s.x+s.width/2).toBeCloseTo(Math.max(...x))
      expect(s.z-s.depth/2).toBeCloseTo(Math.min(...z));expect(s.z+s.depth/2).toBeCloseTo(Math.max(...z))
    }
    const d=structuredClone(PARK_DEFINITION);d.lake.x+=2;d.lake.z-=3
    const moved=resolveParkLayout(d).data.physics.steppingStones
    expect(moved.map(s=>s.id)).toEqual(stones.map(s=>s.id))
    for(const [n,s] of moved.entries()) {
      expect(s.x-stones[n]!.x).toBeCloseTo(2);expect(s.z-stones[n]!.z).toBeCloseTo(-3)
      expect(s.top).toBe(stones[n]!.top);expect(s.width).toBeCloseTo(stones[n]!.width)
    }
  })
})
