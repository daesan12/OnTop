import {describe,it,expect} from 'vitest'
import {PARK_DATA,PARK_LAYOUT} from '../../src/map/park'

describe('circular living plaza',()=>{
  const p=PARK_LAYOUT.LIFE_PLAZA
  it('exports a round floor instead of raising the lawn corners of its bounding rectangle',()=>{
    expect(PARK_DATA.physics.boxes.some(b=>b.id==='plaza-floor')).toBe(false)
    const floor=PARK_DATA.physics.hulls.find(h=>h.id==='plaza-floor')!
    expect(floor.role).toBe('surface')
    for(let n=0;n<floor.vertices.length;n+=3){
      expect(Math.hypot(floor.vertices[n]!-p.x,floor.vertices[n+2]!-p.z)).toBeCloseTo(p.pavingRadius)
      expect([0,.14]).toContain(floor.vertices[n+1])
    }
    expect(PARK_LAYOUT.walkHeight(p.x,p.z)).toBe(.14)
    expect(PARK_LAYOUT.walkHeight(p.x+23,p.z-23)).toBe(0)
  })
  it('removes plaza planters and benches from the drawing and both collision contracts',()=>{
    expect(PARK_LAYOUT.PLAZA_BEDS).toHaveLength(0)
    expect(PARK_LAYOUT.PLAZA_BENCHES).toHaveLength(0)
    expect(PARK_LAYOUT.PLAZA_REST_GARDENS).toHaveLength(0)
    expect(PARK_LAYOUT.PLAZA_REST_BENCHES).toHaveLength(0)
    expect(PARK_DATA.interactions.benches.some(b=>b.id.startsWith('plaza-'))).toBe(false)
    expect(PARK_DATA.physics.boxes.some(b=>/^plaza-(planter|rest)/.test(b.id))).toBe(false)
  })
  it('keeps the four game tables on the same circular floor and trees off the entrances',()=>{
    const tables=PARK_DATA.tables.filter(t=>['table-1','table-2','table-3','table-4'].includes(t.id))
    expect(tables).toHaveLength(4)
    for(const t of tables){
      expect(t.position[1]).toBe(.14)
      expect(Math.hypot(t.position[0]-p.x,t.position[2]-p.z)).toBeCloseTo(Math.sqrt(288))
    }
    expect(PARK_LAYOUT.PLAZA_TREE_SITES.length).toBeGreaterThan(8)
    for(const t of PARK_LAYOUT.PLAZA_TREE_SITES){
      expect(PARK_LAYOUT.onPath(t.x,t.z,.9)).toBe(false)
      expect(PARK_DATA.physics.boxes.find(b=>b.id===t.id)?.half).toEqual([.25,1.8,.25])
    }
    for(const [x,z] of [[0,22],[0,70],[-24,46],[24,46]])expect(PARK_LAYOUT.canWalk(x!,z!)).toBe(true)
  })
  it('keeps the entrance, plaza, main pavilion and pagoda on one north-south axis',()=>{
    const x=PARK_LAYOUT.SETTINGS.mainAxis.x
    expect([PARK_LAYOUT.DRAFT_PARK.spawn[0],p.x,PARK_LAYOUT.DRAFT_PAVILIONS.find(p=>p.id==='P0')!.x,PARK_LAYOUT.SITES.pagoda.x]).toEqual([x,x,x,x])
    for(const id of ['arrival','central-north','north-exit']){
      const path=PARK_LAYOUT.PATHS.find(r=>r.id===id)!
      expect(path.points.every(p=>p[0]===x)).toBe(true)
    }
  })
  it('surrounds the two pavilions beside the main hall without planting in their entrances',()=>{
    for(const id of ['P1','P2'])expect(PARK_LAYOUT.PAVILION_TREE_SITES.filter(t=>t.id.startsWith('pavilion-tree-'+id+'-')).length,id).toBeGreaterThanOrEqual(6)
    // P1 leaves two planting anchors empty for the sound box's body and approach.
    for(const id of ['P1','P2'])expect(PARK_LAYOUT.PAVILION_TREE_SITES.filter(t=>t.id.startsWith('pavilion-tree-'+id+'-')&&Math.abs(t.x)<21).length,id+' inner gap').toBeGreaterThanOrEqual(id==='P1'?6:8)
    for(const t of PARK_LAYOUT.PAVILION_TREE_SITES){
      expect(PARK_LAYOUT.onPath(t.x,t.z,.55),t.id).toBe(false)
      expect(PARK_DATA.physics.boxes.find(b=>b.id===t.id)?.half).toEqual([.25,1.8,.25])
    }
  })
  it('places all three buildings on lawn pockets with nearby trees and clear short approaches',()=>{
    expect(PARK_LAYOUT.PLAZA_TREE_SITES.length).toBeGreaterThan(30)
    for(const k of PARK_LAYOUT.KIOSKS){
      expect(PARK_LAYOUT.PLAZA_TREE_SITES.filter(t=>Math.hypot(t.x-k.x,t.z-k.z)<10).length,k.kind).toBeGreaterThanOrEqual(3)
      for(const sx of [-.9,0,.9])for(const sz of [-.9,0,.9]){
        const dx=sx*k.width/2,dz=sz*k.depth/2,x=k.x+dx*Math.cos(k.yaw)+dz*Math.sin(k.yaw),z=k.z-dx*Math.sin(k.yaw)+dz*Math.cos(k.yaw)
        expect(Math.hypot(x-p.x,z-p.z),k.kind).toBeGreaterThan(p.pavingRadius)
        expect(PARK_LAYOUT.onPath(x,z),k.kind).toBe(false)
      }
    }
  })
})
