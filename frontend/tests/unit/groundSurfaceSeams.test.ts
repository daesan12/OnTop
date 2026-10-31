import {describe,it,expect} from 'vitest'
import {Mesh,MeshBasicMaterial,Raycaster,Vector3} from 'three'
import {PARK_LAYOUT as p} from '../../src/map/park'
import {fountainTerrain} from '../../src/layout-preview/districtGeometry'
import {fountainPavingRadius} from '../../src/layout-preview/fountainPaving'
import {gardenArt,pavilionStairsArt} from '../../src/layout-preview/sceneGeometry'

const material=new MeshBasicMaterial({side:2}),ray=new Raycaster()
describe('continuous rendered ground surfaces',()=>{
 it('closes the fountain collar at every angle above and below the lawn height',()=>{
  const mesh=new Mesh(fountainTerrain,material),site=p.SITES.fountain
  for(let n=0;n<128;n++)for(const y of [-.015,.025,.075]){
   const a=(n+.37)*Math.PI/64,c=Math.cos(a),s=Math.sin(a)
   ray.set(new Vector3(site.x+c*(fountainPavingRadius+.5),y,site.z+s*(fountainPavingRadius+.5)),new Vector3(-c,0,-s))
   expect(ray.intersectObject(mesh)[0]?.distance).toBeLessThan(.52)
  }
 })
 it('has one exposed side at every pavilion stair seam instead of overlapping box faces',()=>{
  const mesh=new Mesh(pavilionStairsArt.stone!,material)
  for(const stair of p.DRAFT_STAIRS)for(const side of [-1,1])for(let n=1;n<stair.count;n++){
   const z=stair.z+side*(stair.join+n*stair.tread),y=.137
   ray.set(new Vector3(stair.x-3,y,z),new Vector3(1,0,0))
   const hits=ray.intersectObject(mesh).filter(h=>Math.abs(h.point.x-(stair.x-1.8))<1e-4)
   expect(hits,stair.id+' seam '+n).toHaveLength(1)
  }
 })
 it('leaves the octagonal platforms as the sole owner of their top plane',()=>{
  const mesh=new Mesh(pavilionStairsArt.stone!,material)
  for(const stair of p.DRAFT_STAIRS){
   const pavilion=p.DRAFT_PAVILIONS.find(q=>q.id===stair.id)!,face=4.5*pavilion.scale*Math.cos(Math.PI/8)
   for(const side of [-1,1]){
    ray.set(new Vector3(stair.x+.273,stair.floor+1,stair.z+side*(face-.02)),new Vector3(0,-1,0))
    expect(ray.intersectObject(mesh).filter(h=>Math.abs(h.point.y-stair.floor)<1e-4),stair.id).toHaveLength(0)
   }
  }
 })
 it('does not stack a pagoda tread over the terrace or duplicate its stair sides',()=>{
  const mesh=new Mesh(gardenArt.stone!,material),site=p.SITES.pagoda,settings=p.SETTINGS.pagoda
  for(const side of [-1,1]){
   ray.set(new Vector3(site.x+.273,site.floor+1,site.z+side*(settings.terraceHalf-.005)),new Vector3(0,-1,0))
   expect(ray.intersectObject(mesh).filter(h=>Math.abs(h.point.y-site.floor)<1e-4)).toHaveLength(1)
   for(let n=1;n<settings.steps;n++){
    const z=site.z+side*(settings.terraceHalf+n*settings.tread)
    ray.set(new Vector3(site.x-settings.stairHalfWidth-1,.137,z),new Vector3(1,0,0))
    expect(ray.intersectObject(mesh).filter(h=>Math.abs(h.point.x-(site.x-settings.stairHalfWidth))<1e-4)).toHaveLength(1)
   }
  }
 })
})
