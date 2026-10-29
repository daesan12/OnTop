import {it,expect} from 'vitest'
import {PARK_LAYOUT,PARK_DATA,PARK_DEFINITION} from '../../src/map/park'

it('removes ad placements, markers and their invisible blockers while retaining game facilities',()=>{
 const removed=['a-frame-arrival','a-frame-pavilion','a-frame-west-walk','advertising-balloon']
 for(const collection of [PARK_LAYOUT.MARKERS,PARK_LAYOUT.DRAFT_BOXES,PARK_DATA.facilities,PARK_DATA.collision.obstacles,PARK_DATA.physics.boxes,PARK_DATA.physics.hulls])
  expect(collection.filter(x=>removed.includes(x.id))).toEqual([])
 expect('balloon' in PARK_DEFINITION.sites).toBe(false)
 for(const [x,z] of [[-16,32],[-35,-13],[-57,-40]])expect(PARK_LAYOUT.canWalk(x!,z!)).toBe(true)
 expect(PARK_DATA.tables).toHaveLength(18);expect(PARK_DATA.interactions.benches).toHaveLength(71)
 expect(PARK_LAYOUT.MARKERS.find(m=>m.id==='layout-background')!.label).toBe('외곽 건물')
})
