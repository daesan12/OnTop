import {it,expect} from 'vitest'
import {inKioskEntrance,inMailboxClearing} from '../../src/map/park/planting'
import {PARK_DATA,PARK_LAYOUT} from '../../src/map/park'
import {trunks,shoreTrunks,SUPPLEMENTAL_TREE_SITES} from '../../src/layout-preview/sceneGeometry'
import {simpleTreeBelts} from '../../src/layout-preview/PreviewLandscaping'

it('clears all three kiosk fronts across existing woods and the new planting belts',()=>{
  const all=[...trunks,...shoreTrunks,...Object.values(simpleTreeBelts).flatMap(b=>b.trunks)]
  for(const t of all)expect(inKioskEntrance(t.p[0],t.p[2],PARK_LAYOUT.KIOSKS)).toBe(false)
  for(const k of PARK_LAYOUT.KIOSKS){
    expect(PARK_LAYOUT.PLAZA_TREE_SITES.filter(t=>Math.hypot(t.x-k.x,t.z-k.z)<12).length,k.kind).toBeGreaterThanOrEqual(5)
  }
})

it('reuses the original service tree family at unchanged planting anchors',()=>{
  for(const b of Object.values(simpleTreeBelts)){
    expect(b.plantings).toHaveLength(b.trunks.length)
    expect(b.plantings.map(t=>[t.position[0],t.position[2]])).toEqual(b.trunks.map(t=>[t.p[0],t.p[2]]))
    expect(b.parts.wood.length).toBeGreaterThan(b.trunks.length*4)
    expect(b.parts.crowns.length+b.parts.cones.length).toBeGreaterThan(b.trunks.length*3)
    expect(b.parts.wood.every(p=>['#885535','#95623b','#70462f'].includes(p.c))).toBe(true)
  }
})

it('keeps every tree belt outside the sound box and its usable clearing',()=>{
  const all=[...trunks,...shoreTrunks,...Object.values(simpleTreeBelts).flatMap(b=>b.trunks)]
  const {mailbox}=PARK_LAYOUT.SITES,r=PARK_LAYOUT.SETTINGS.planting.mailboxTreeClearance
  for(const t of all)expect(inMailboxClearing(t.p[0],t.p[2],mailbox,r)).toBe(false)
  for(const t of [...PARK_LAYOUT.PLAZA_TREE_SITES,...PARK_LAYOUT.PAVILION_TREE_SITES])expect(inMailboxClearing(t.x,t.z,mailbox,r)).toBe(false)
  expect(PARK_DATA.interactions.mailbox.position).toEqual([-18,0,18])
  expect(PARK_LAYOUT.canWalk(mailbox.x,mailbox.z+1.5)).toBe(true)
})

it('adds woodland trees in open gaps while keeping paths, facilities and neighbouring trunks clear',()=>{
 expect(SUPPLEMENTAL_TREE_SITES.length).toBeGreaterThan(50)
 const fitness=PARK_LAYOUT.SITES.fitness
 for(const t of SUPPLEMENTAL_TREE_SITES){
  expect(PARK_LAYOUT.onPath(t.x,t.z,1.4)).toBe(false)
  expect(inKioskEntrance(t.x,t.z,PARK_LAYOUT.KIOSKS)).toBe(false)
  expect(Math.hypot((t.x-fitness.x)/(PARK_LAYOUT.DRAFT_FITNESS_AREA.rx+3),(t.z-fitness.z)/(PARK_LAYOUT.DRAFT_FITNESS_AREA.rz+3))).toBeGreaterThanOrEqual(1)
  expect(trunks.some(p=>p.p[0]===t.x&&p.p[2]===t.z)).toBe(true)
  for(const p of trunks)if(p.p[0]!==t.x||p.p[2]!==t.z)expect(Math.hypot(p.p[0]-t.x,p.p[2]-t.z)).toBeGreaterThanOrEqual(2.1-1e-6)
 }
})

it('keeps the entire outdoor stone seating footprint clear of paths, including four-player seats',()=>{
  for(const t of PARK_DATA.tables.filter(t=>!t.pavilionId&&t.assetId!=='procedural/vr-stone-game-table'))for(const [sx,,sz] of t.seatAnchors){
    for(const dx of [-.6,0,.6])for(const dz of [-.6,0,.6])expect(PARK_LAYOUT.onPath(t.position[0]+sx+dx,t.position[2]+sz+dz),t.id).toBe(false)
  }
  const t=PARK_DATA.tables.find(t=>t.id==='table-15')!
  expect(t.position).toEqual([48,0,-70.5])
  expect(PARK_DATA.physics.boxes.find(b=>b.id==='table-15-top')!.center).toEqual([48,.86,-70.5])
})
