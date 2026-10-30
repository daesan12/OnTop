import { afterEach,describe,expect,it,vi } from 'vitest'
import { DoubleSide,Mesh,MeshBasicMaterial,Raycaster,Vector3 } from 'three'

afterEach(()=>{vi.unstubAllEnvs();vi.resetModules()})
describe.each(['test','park-integration'])('main gate connections in %s mode',mode=>{
  it('joins the lintel to the roof without timber protruding through its facets',async()=>{
    vi.stubEnv('MODE',mode);vi.resetModules()
    const {mainGateArt:art}=await import('../../src/layout-preview/reviewFurnitureGeometry')
    const {MAIN_GATE:gate}=await import('../../src/layout-preview/layout')
    const material=new MeshBasicMaterial({side:DoubleSide}),roof=new Mesh(art.tile,material),wood=new Mesh(art.wood,material),ray=new Raycaster()
    try{
      for(const x of [-3.5,-2.6,-1.8,-.9,-.3,.3,.9,1.8,2.6,3.5])for(const z of [-.65,-.35,0,.35,.65]){
        ray.set(new Vector3(x,8,gate.z+z),new Vector3(0,-1,0))
        const roofY=ray.intersectObject(roof)[0]!.point.y,woodY=ray.intersectObject(wood)[0]!.point.y
        expect(roofY-woodY,`roof joint ${x},${z}`).toBeCloseTo(.006,3)
      }
      ray.set(new Vector3(0,8,gate.z),new Vector3(0,-1,0))
      // The decorative finial must not be extruded into a timber spike.
      expect(ray.intersectObject(wood)[0]!.point.y).toBeLessThan(5.78)
    }finally{material.dispose()}
  })
  it('supports both lanterns continuously from the lintel to the lamp body',async()=>{
    vi.stubEnv('MODE',mode);vi.resetModules()
    const {mainGateArt:art}=await import('../../src/layout-preview/reviewFurnitureGeometry')
    const {MAIN_GATE:gate,canWalk}=await import('../../src/layout-preview/layout')
    const material=new MeshBasicMaterial({side:DoubleSide}),ray=new Raycaster()
    try{
      for(const side of [-1,1]){
        ray.set(new Vector3(side*(gate.postX+.05),4.2,gate.z+1.25),new Vector3(0,-1,0))
        const span=(kind:'wood'|'metal'|'tile'|'glow')=>{
          const hits=ray.intersectObject(new Mesh(art[kind],material))
          expect(hits.length,kind+' lantern connection').toBeGreaterThan(1)
          return {top:hits[0]!.point.y,bottom:hits.at(-1)!.point.y}
        }
        const arm=span('wood'),hanger=span('metal'),cap=span('tile'),lamp=span('glow')
        expect(arm.bottom).toBeLessThan(hanger.top)
        expect(hanger.bottom).toBeLessThan(cap.top)
        expect(cap.bottom).toBeLessThan(lamp.top)
      }
      for(const z of [gate.z-2,gate.z-1.5])expect(canWalk(0,z)).toBe(true)
    }finally{material.dispose()}
  })
})
