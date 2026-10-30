import {describe,it,expect} from 'vitest'
import {Mesh,MeshBasicMaterial,Raycaster,Vector3} from 'three'
import {PARK_DATA as d,PARK_LAYOUT as l} from '../../src/map/park'
import {TABLES} from '../../src/config/world'
import {tableSeats} from '../../src/config/table-seats'
import {pathPaving} from '../../src/layout-preview/landscapeGeometry'
import {canReachConstruction} from '../../src/features/construction/model'

describe('new park facility completion',()=>{
  it('appends two four-player VR tables without replacing existing IDs or seat offsets',()=>{
    expect(d.tables).toHaveLength(18)
    for(const old of TABLES)expect(d.tables.find(t=>t.id===old.id)!.seatAnchors).toEqual(old.seatAnchors)
    expect(d.tables.reduce((n,t)=>n+t.seatAnchors.length,0)).toBe(72)
    for(const set of l.VR_STONE_SETS){
      const t=l.DRAFT_TABLES.find(t=>t.id===set.tableId)!
      expect(t.position).toEqual([set.x,.1,set.z])
      expect(tableSeats(t).map(s=>[s.x,0,s.z])).toEqual(t.seatAnchors)
      const top=d.physics.boxes.find(b=>b.id===t.id+'-top')!
      // Movement barrier forbids jumping on furniture; the rendered top stays at 1.06m.
      expect(top.center[1]+top.half[1]).toBeCloseTo(t.position[1]+2.5)
      const path=new Mesh(pathPaving,new MeshBasicMaterial({side:2})),ray=new Raycaster()
      // The analytic path helper has round end caps; inspect actual paving at the VR junction.
      for(const [n,[x,,z]] of t.seatAnchors.entries()){
        const solid=d.physics.boxes.find(b=>b.id===t.id+'-chair-'+n)!
        expect(solid.center).toEqual([set.x+x,t.position[1]+1.25,set.z+z])
        for(const dx of [-.6,0,.6])for(const dz of [-.6,0,.6]){
          ray.set(new Vector3(set.x+x+dx,5,set.z+z+dz),new Vector3(0,-1,0))
          expect(ray.intersectObject(path),t.id+' seat '+n).toHaveLength(0)
        }
      }
    }
  })
  it('registers two safe seats on each forest bench and retains four original fountain identities',()=>{
    expect(d.interactions.benches).toHaveLength(71)
    expect(d.interactions.benches.reduce((n,b)=>n+b.seats.length,0)).toBe(142)
    for(const b of l.SETTINGS.forestBenches){
      const bench=d.interactions.benches.find(s=>s.id===b.id)!
      expect(bench.position).toEqual([b.x,0,b.z])
      expect(bench.seats).toHaveLength(2)
      for(const s of bench.seats){expect(l.canWalk(s.exit.x,s.exit.z),b.id).toBe(true);expect(s.use.y).toBe(.8)}
      expect(d.physics.boxes.find(s=>s.id===b.id+'-seat')!.center[1]).toBe(.5)
    }
    expect(d.interactions.benches.filter(b=>b.siteId.startsWith('bench-fountain-')).map(b=>b.id)).toEqual(['bench-76','bench-77','bench-78','bench-79'])
    for(const b of d.interactions.benches.filter(b=>b.siteId.startsWith('bench-fountain-')))for(const s of b.seats)expect(l.canWalk(s.exit.x,s.exit.z),b.id+' exit').toBe(true)
    expect(d.interactions.benches.some(b=>b.siteId.includes('photo'))).toBe(false)
  })
  it('registers three construction notices at reachable building entrances',()=>{
    expect(d.interactions.construction.map(s=>s.id)).toEqual(['layout-shop','layout-drink','layout-photo'])
    for(const site of d.interactions.construction){
      const [x,y,z]=site.reachPosition
      expect(site.status).toBe('construction')
      expect(canReachConstruction({x,y,z},site.id)).toBe(true)
      expect(canReachConstruction({x:x+site.radius+.01,y,z},site.id)).toBe(false)
      expect(canReachConstruction({x,y:y+site.heightTolerance+.01,z},site.id)).toBe(false)
      expect(l.canWalk(x,z),site.id).toBe(true)
    }
  })
})
