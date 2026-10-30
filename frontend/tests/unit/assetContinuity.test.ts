import {describe,it,expect,vi,afterAll} from 'vitest'
import {Mesh,MeshBasicMaterial,Raycaster,Vector3,type BufferGeometry} from 'three'
import {createConnectedBenchFrame} from '../../src/world/art/connectedBenchFrame'
import {createFitnessPaving} from '../../src/world/art/fitnessPavingGeometry'

vi.stubEnv('MODE','layout-preview')
const {vrBoothArt}=await import('../../src/world/art/activityPropGeometry')
const {createPavilionBench}=await import('../../src/world/art/pavilionInteriorGeometry')
const {fitnessRestArt}=await import('../../src/layout-preview/districtGeometry')
const {PARK_DATA}=await import('../../src/map/park')
afterAll(()=>vi.unstubAllEnvs())

const material=new MeshBasicMaterial(),ray=new Raycaster()
const meshes=(geometry:BufferGeometry[])=>geometry.map(g=>new Mesh(g,material))
function hit(objects:Mesh[],from:[number,number,number],direction:[number,number,number]) {
 ray.set(new Vector3(...from),new Vector3(...direction));return ray.intersectObjects(objects,false)[0]?.point
}
describe('connected low-poly park assets',()=>{
 it('retains closed bench legs, seat beams and back supports without fine decorative curves',()=>{
  const g=createConnectedBenchFrame(),objects=meshes([g])
  try {
   expect(g.index!.count/3).toBeLessThan(400)
   for(const x of [-1.17,1.17]){
    expect(hit(objects,[x,2,0],[0,-1,0])!.y).toBeGreaterThan(.48)
    for(const y of [.86,1.03,1.2])expect(hit(objects,[x,y,.5],[0,0,-1])!.z).toBeGreaterThan(-.42)
   }
  }finally{g.dispose()}
 })
 it('connects pavilion legs to the unchanged .56m seat height',()=>{
  const g=createPavilionBench(1.2),objects=meshes([g])
  try {expect(hit(objects,[0,2,0],[0,-1,0])!.y).toBeCloseTo(.56);expect(g.getAttribute('position').count).toBeLessThan(500)}finally{g.dispose()}
 })
 it('has a visible solid roof underside, with the original exterior top and an open hall entrance',()=>{
  const roof=meshes([vrBoothArt.tile!])
  for(const [x,z] of [[0,1],[3,2],[-3,-2],[5,3]]) {
   const top=hit(roof,[x!,12,z!],[0,-1,0]),bottom=hit(roof,[x!,3,z!],[0,1,0])
   expect(top).toBeDefined();expect(bottom).toBeDefined();expect(top!.y-bottom!.y).toBeCloseTo(.14,4)
  }
  const art=meshes(Object.values(vrBoothArt))
  const doorway=hit(art,[0,1.8,5],[0,0,-1])
  expect(doorway).toBeDefined();expect(doorway!.z).toBeLessThan(-1)
 })
 it('covers the elliptical fitness floor with coplanar pavers and grout, without holes or overlapping top faces',()=>{
  const paving=createFitnessPaving(30,22),objects=meshes([paving.geometry]),p=paving.geometry.getAttribute('position')
  try {
   expect(paving.tileCount).toBeGreaterThan(200);expect(paving.triangleCount).toBeLessThan(5000)
   let area=0
   for(let n=0;n<p.count;n+=3)if([n,n+1,n+2].every(i=>Math.abs(p.getY(i)-.1)<1e-6)) {
    const cross=(p.getZ(n+1)-p.getZ(n))*(p.getX(n+2)-p.getX(n))-(p.getX(n+1)-p.getX(n))*(p.getZ(n+2)-p.getZ(n))
    expect(cross).toBeGreaterThanOrEqual(-1e-7);area+=cross/2
   }
   const expected=128/2*15*11*Math.sin(Math.PI*2/128)
   expect(area).toBeCloseTo(expected,2)
   for(let n=0;n<128;n++)for(const r of [.25,.65,.97]){
    const a=n*Math.PI/64
    expect(hit(objects,[Math.cos(a)*15*r,.5,Math.sin(a)*11*r],[0,-1,0])?.y).toBeCloseTo(.1,6)
   }
   expect(paving.geometry.getAttribute('uv')).toBeUndefined()
  }finally{paving.geometry.dispose()}
 })
 it('keeps every existing tree-ring seat supported by an upward-facing closed plank',()=>{
  const objects=meshes(Object.values(fitnessRestArt))
  for(const b of PARK_DATA.interactions.benches.filter(b=>b.id.startsWith('bench-fitness-ring-')))for(const seat of b.seats)
   expect(hit(objects,[seat.use.x,2,seat.use.z],[0,-1,0])?.y).toBeCloseTo(.62,5)
 })
})
