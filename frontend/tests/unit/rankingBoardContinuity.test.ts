import {it,expect,vi,afterAll} from 'vitest'
import {Mesh,MeshBasicMaterial,DoubleSide,Raycaster,Vector3,type BufferGeometry} from 'three'
import {capturePropBuilds,encodeBakedProps,installBakedProps} from '../../src/world/art/bakedProps'

vi.stubEnv('MODE','layout-preview')
const {rankingBoardArt:art,buildRankingBoard,rankingBoardModelMetrics}=await import('../../src/layout-preview/RankingBoardModel')
const material=new MeshBasicMaterial({side:DoubleSide}),ray=new Raycaster()
const wood=new Mesh(art.wood!,material),roof=new Mesh(art.tile!,material),paper=new Mesh(art.paint!,material)
afterAll(()=>{material.dispose();vi.unstubAllEnvs()})
const hit=(mesh:Mesh,from:[number,number,number],direction:[number,number,number])=>{
 ray.set(new Vector3(...from),new Vector3(...direction));return ray.intersectObject(mesh)[0]
}

it('seats the timber inside the closed roof without protrusions above its facets',()=>{
 for(const x of [-4.2,-2.7,-1.38,0,1.38,2.7,4.2])for(const z of [-.3,.3]){
  const top=hit(roof,[x,10,z],[0,-1,0])!.point.y
  const underside=hit(roof,[x,4,z],[0,1,0])!.point.y
  const timber=hit(wood,[x,10,z],[0,-1,0])!.point.y
  expect(top-underside).toBeCloseTo(.12,4)
  expect(top-timber).toBeCloseTo(.04,4)
  expect(timber).toBeGreaterThan(underside)
 }
})

it('joins both paper faces to a solid panel and bridges the panel tops to the crossbeam',()=>{
 for(const x of [-2.77,0,2.77]){
  const front=hit(wood,[x,2.19,1],[0,0,-1])!.point.z
  const back=hit(wood,[x,2.19,-1],[0,0,1])!.point.z
  expect(front).toBeCloseTo(.21)
  expect(back).toBeCloseTo(-.21)
  expect(hit(paper,[x,2.19,0],[0,0,1])!.point.z).toBeLessThan(front)
  expect(hit(paper,[x,2.19,0],[0,0,-1])!.point.z).toBeGreaterThan(back)
  for(let y=3.65;y<=4.25;y+=.025)expect(hit(wood,[x,y,1],[0,0,-1])?.distance).toBeLessThan(1.1)
 }
})

it('attaches both lantern hangers and the title plaque to the frame',()=>{
 for(const x of [-4.58,4.58])for(let y=3.4;y<=4.16;y+=.04)expect(hit(wood,[x,y,.6],[0,0,1])?.distance).toBeLessThan(.5)
 for(const x of [-1.12,1.12])for(const z of [.1,.4,.7])expect(hit(wood,[x,4.1,z],[1,0,0])?.distance).toBeLessThan(4)
 // Brackets remain behind the plaque; they must not cover either side of its lettering.
 for(const x of [-1.12,1.12])expect(hit(wood,[x,4.1,1],[0,0,-1])!.point.z).toBeCloseTo(.84)
 expect(rankingBoardModelMetrics.triangleCount).toBeLessThan(1000)
})

it('loads the same connected geometry from the production bake without rebuilding empty roof parts',async()=>{
 const captured=capturePropBuilds(),source=buildRankingBoard()
 const bytes=encodeBakedProps(captured)
 await installBakedProps(bytes.buffer as ArrayBuffer)
 const baked=buildRankingBoard()
 try{
  expect(Object.keys(baked)).toEqual(Object.keys(source))
  for(const key of Object.keys(source) as (keyof typeof source)[]){
   expect(Array.from(baked[key]!.getAttribute('position').array)).toEqual(Array.from(source[key]!.getAttribute('position').array))
  }
 }finally{for(const g of [...Object.values(source),...Object.values(baked)] as BufferGeometry[])g.dispose()}
})
