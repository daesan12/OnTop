import { describe,it,expect } from 'vitest'
import { Mesh,MeshBasicMaterial,Raycaster,Vector3 } from 'three'
import { pathPaving } from '../../src/layout-preview/landscapeGeometry'
import { fountainTerrain,fitnessRestArt } from '../../src/layout-preview/districtGeometry'
import { fountainPavingHeight } from '../../src/layout-preview/fountainPaving'
import { PARK_DATA,PARK_LAYOUT } from '../../src/map/park'

const material=new MeshBasicMaterial({side:2}),ray=new Raycaster()
const paving=[new Mesh(pathPaving,material),new Mesh(fountainTerrain,material)]
const bench=Object.values(fitnessRestArt).map(g=>new Mesh(g,material))
function top(meshes:Mesh[],x:number,z:number){
  ray.set(new Vector3(x,3,z),new Vector3(0,-1,0))
  return ray.intersectObjects(meshes)[0]?.point.y
}
describe('continuous fountain slopes and tree-ring bench',()=>{
  it('joins all four actual entrance surfaces without flat overhangs or a sudden drop',()=>{
    const {x,z}=PARK_LAYOUT.SITES.fountain,outer=PARK_LAYOUT.DRAFT_FOUNTAIN.plazaRadius
    // The north entrance follows the existing curved grove approach.
    for(const [dx,dz] of [[0,1],[1,0],[-.12,-Math.sqrt(1-.12**2)],[-1,0]]){
      let previous:number|undefined,previousWalk:number|undefined
      for(let r=outer+1;r>=8;r-=.1){
        const px=x+dx!*r,pz=z+dz!*r,y=top(paving,px,pz)
        expect(y,`missing entrance paving at ${px},${pz}`).toBeDefined()
        if(previous!==undefined)expect(Math.abs(y!-previous),`abrupt change at radius ${r}`).toBeLessThan(.05)
        const walk=PARK_LAYOUT.walkHeight(px,pz)
        if(previousWalk!==undefined)expect(Math.abs(walk-previousWalk)).toBeLessThan(.05)
        expect(Math.abs(y!-walk)).toBeLessThan(.11)
        if(r<outer-.1)expect(Math.abs(y!-fountainPavingHeight(px,pz))).toBeLessThan(.025)
        previous=y;previousWalk=walk
      }
    }
  })
  it('keeps the existing terrain profile and joins the paved edge at every angle',()=>{
    const {x,z}=PARK_LAYOUT.SITES.fountain,r=PARK_LAYOUT.DRAFT_FOUNTAIN.plazaRadius
    for(let n=0;n<128;n++){
      const a=n*Math.PI/64,px=x+Math.cos(a)*r,pz=z+Math.sin(a)*r
      expect(fountainPavingHeight(px,pz)).toBeCloseTo(.085,6)
      const innerX=x+Math.cos(a)*8,innerZ=z+Math.sin(a)*8
      expect(fountainPavingHeight(innerX,innerZ)).toBeCloseTo(PARK_LAYOUT.fountainGroundHeight(innerX,innerZ)+.008,6)
    }
  })
  it('supports both seats of all four existing ring bench IDs on .62m timber and keeps safe outward exits',()=>{
    const ring=PARK_DATA.interactions.benches.filter(b=>b.id.startsWith('bench-fitness-ring-'))
    expect(ring.map(b=>b.id)).toEqual([0,1,2,3].map(n=>'bench-fitness-ring-'+n))
    for(const b of ring)for(const seat of b.seats){
      expect(top(bench,seat.use.x,seat.use.z)).toBeCloseTo(.62,4)
      expect(PARK_LAYOUT.canWalk(seat.exit.x,seat.exit.z)).toBe(true)
      const dx=seat.use.x-PARK_LAYOUT.SITES.fitness.x,dz=seat.use.z-PARK_LAYOUT.SITES.fitness.z
      expect(dx*Math.sin(seat.use.yaw)+dz*Math.cos(seat.use.yaw)).toBeGreaterThan(2.9)
    }
  })
})
