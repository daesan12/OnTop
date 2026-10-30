import { Mesh,MeshBasicMaterial,Raycaster,Vector3 } from 'three'
import { describe,it,expect } from 'vitest'
import { PARK_SIZE,WORLD } from '../../src/config'
import { createCityStreets } from '../../src/world/art/CityStreets'
import { roundedSquare,insideRoundedSquare } from '../../src/world/art/roundedOutline'
import { curvedWallCorners } from '../../src/world/art/RoundedBoundaryCorners'
import { mainGateArt } from '../../src/layout-preview/reviewFurnitureGeometry'
import { boundarySections } from '../../src/world/art/ParkBoundary'
import { VR_COURSE_PADS } from '../../src/config/parkLayout'
import { DRAFT_JUMP_PADS,SITES } from '../../src/layout-preview/layout'

describe('reuse of the original map exterior and jump course',()=>{
  it('keeps the default street dimensions while moving the original signals outward for 180m',()=>{
    const original=createCityStreets(),expanded=createCityStreets(180)
    expect(original).toEqual(createCityStreets(PARK_SIZE))
    expect(original.asphalt[0]!.s).toEqual([PARK_SIZE+36,.12,13.4])
    expect(expanded.asphalt[0]!.s).toEqual([216,.12,13.4])
    expect(expanded.lights.length).toBe(original.lights.length)
    for(let i=0;i<original.lights.length;i++) {
      const before=original.lights[i]!,after=expanded.lights[i]!
      expect(after.s).toEqual(before.s);expect(after.c).toBe(before.c)
      expect(after.p[1]).toBe(before.p[1])
      expect(Math.hypot(after.p[0]-before.p[0],after.p[2]-before.p[2])).toBeCloseTo((180-PARK_SIZE)/2)
    }
  })
  it('keeps the original wall sections and leaves only a south gate in the expanded wall',()=>{
    const original=boundarySections(WORLD.halfSize)
    expect(original).toHaveLength(32)
    for(const s of original)expect(s.span).toBeCloseTo((WORLD.halfSize*2-.9)/8)
    const expanded=boundarySections(90,16)
    for(const side of [0,1,2,3]) {
      const parts=expanded.filter(s=>s.side===side)
      expect(parts.reduce((sum,s)=>sum+s.span,0)).toBeCloseTo(179.1-(side===2?16:0))
      for(let x=-89.5;x<=89.5;x+=.5)expect(parts.some(s=>x>=s.x-s.span/2-1e-6&&x<=s.x+s.span/2+1e-6)).toBe(side!==2||Math.abs(x)>=8)
    }
  })
  it('joins rounded wall corners to straight spans and keeps the gate roof at the actual entrance',()=>{
    const sections=boundarySections(90,16,6)
    for(const side of [0,1,2,3]) {
      const parts=sections.filter(s=>s.side===side)
      expect(Math.min(...parts.map(s=>s.x-s.span/2))).toBeCloseTo(-84)
      expect(Math.max(...parts.map(s=>s.x+s.span/2))).toBeCloseTo(84)
    }
    const geometry=curvedWallCorners(90,6)
    for(const g of Object.values(geometry)) {
      expect(Array.from(g.getAttribute('position').array).every(Number.isFinite)).toBe(true)
      g.computeBoundingBox();expect(g.boundingBox!.max.x).toBeLessThan(91);g.dispose()
    }
    // The curved roof mapping must keep its outward winding; a mirrored bend was culled from above.
    const roof=curvedWallCorners(90,6),mesh=new Mesh(roof.clay,new MeshBasicMaterial()),ray=new Raycaster()
    for(const corner of [0,1,2,3]) {
      const a=corner*Math.PI/2+Math.PI/4,cx=(corner===0||corner===3?1:-1)*84,cz=(corner<2?1:-1)*84
      ray.set(new Vector3(cx+Math.cos(a)*6,6,cz+Math.sin(a)*6),new Vector3(0,-1,0))
      expect(ray.intersectObject(mesh).length,'roof bend '+corner).toBeGreaterThan(0)
    }
    Object.values(roof).forEach(g=>g.dispose());(mesh.material as MeshBasicMaterial).dispose()
    for(const g of Object.values(mainGateArt)) {
      g.computeBoundingBox();expect(g.boundingBox!.min.z).toBeGreaterThan(85)
      expect(g.boundingBox!.max.z).toBeLessThan(93)
    }
    expect(mainGateArt.tile!.boundingBox!.max.y).toBeGreaterThan(6)
    const points=roundedSquare(90,6)
    expect(points.every(([x,z])=>insideRoundedSquare(x,z,90.000001,6))).toBe(true)
    expect(insideRoundedSquare(89,89,90,6)).toBe(false)
  })
  it('keeps pad IDs, heights and dimensions while clearing the wider stone tower',()=>{
    for(const [i,p] of DRAFT_JUMP_PADS.entries()) {
      const source=VR_COURSE_PADS[i]!
      expect({...p,x:source.x,z:source.z,id:undefined}).toEqual({...source,id:undefined})
      expect(Math.hypot(p.x-SITES.vrPagoda.x,p.z-SITES.vrPagoda.z)).toBeCloseTo(5.9)
      expect(p.id).toBe("future-jump-pad-"+i)
    }
  })
})
