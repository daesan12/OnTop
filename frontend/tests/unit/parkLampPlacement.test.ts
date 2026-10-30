import {it,expect} from 'vitest'
import {PARK_DATA,PARK_LAYOUT} from '../../src/map/park'
import {trunks,shoreTrunks} from '../../src/layout-preview/sceneGeometry'
import {simpleTreeBelts} from '../../src/layout-preview/PreviewLandscaping'

it('moves seven obstructive lamps while keeping all 42 IDs and aligning solids to their floor',()=>{
 const {DRAFT_LAMPS:lamps,TREE_LAMP_RESERVATIONS:before}=PARK_LAYOUT
 expect(lamps).toHaveLength(42)
 expect(lamps.flatMap(([x,,z],n)=>x!==before[n]![0]||z!==before[n]![2]?[n]:[])).toEqual([0,1,2,3,4,36,41])
 const solids=PARK_DATA.physics.boxes.filter(b=>/^lamp-\d+$/.test(b.id))
 expect(solids.map(b=>b.id)).toEqual(lamps.map((_,n)=>'lamp-'+n))
 for(const [n,[x,y,z]] of lamps.entries()) {
  expect(y).toBe(PARK_LAYOUT.walkHeight(x,z))
  expect(solids[n]!.center).toEqual([x,y+2.5,z])
  expect(solids[n]!.half).toEqual([.12,2.5,.12])
  expect(PARK_LAYOUT.onPath(x,z,.25)).toBe(false)
  // The wide tree-free forecourt can include existing plaza-rim lamps after a
  // building rotates. Lamp posts must clear the solids and actual entrance path.
  for(const k of PARK_LAYOUT.KIOSKS){
   const dx=x-k.x,dz=z-k.z,across=dx*Math.cos(k.yaw)-dz*Math.sin(k.yaw),forward=dx*Math.sin(k.yaw)+dz*Math.cos(k.yaw)
   expect(Math.abs(across)>k.width/2+.48||Math.abs(forward)>k.depth/2+.48,'lamp-'+n+' '+k.kind).toBe(true)
  }
  const entrance=PARK_DATA.interactions.construction.find(s=>s.id==='layout-drink')!
  expect(Math.hypot(x-entrance.reachPosition[0],z-entrance.reachPosition[2]),'lamp-'+n+' lottery reach').toBeGreaterThan(entrance.radius+.48)
 }
 for(const [x,y,z] of lamps.slice(0,5)) {
  expect(y).toBe(.14)
  expect(Math.hypot(x-PARK_LAYOUT.LIFE_PLAZA.x,z-PARK_LAYOUT.LIFE_PLAZA.z)).toBeGreaterThan(22)
 }
})

it('keeps lamp posts clear of rendered trees and bench entry and exit positions',()=>{
 const trees=[...trunks,...shoreTrunks,...Object.values(simpleTreeBelts).flatMap(b=>b.trunks)]
 for(const [x,,z] of PARK_LAYOUT.DRAFT_LAMPS) {
  expect(Math.min(...trees.map(t=>Math.hypot(t.p[0]-x,t.p[2]-z)))).toBeGreaterThan(1.9)
  for(const b of PARK_DATA.interactions.benches)for(const s of b.seats)for(const p of [s.use,s.exit])
   expect(Math.hypot(p.x-x,p.z-z)).toBeGreaterThan(1)
 }
})
