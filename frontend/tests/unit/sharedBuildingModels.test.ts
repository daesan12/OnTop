import {describe,it,expect} from 'vitest'
import {Mesh,Texture,type Object3D} from 'three'
import {factory} from '../../src/park-renewal/assetFactories'
import {groundObject} from '../../src/park-renewal/assetSizing'
import {SUB_PAVILION_SCALE} from '../../src/park-renewal/plan'
import {createSharedBuildingModels} from '../../src/park-renewal/sharedBuildingModels'

function geometryBytes(root:Object3D){
 const nodes:unknown[]=[]
 root.traverse(o=>{
  const mesh=o as Mesh
  nodes.push({type:o.type,name:o.name,p:o.position.toArray(),q:o.quaternion.toArray(),s:o.scale.toArray(),
   visible:o.visible,castShadow:o.castShadow,receiveShadow:o.receiveShadow,userData:o.userData,
   ...(mesh.isMesh?{attributes:Object.fromEntries(Object.entries(mesh.geometry.attributes).map(([key,a])=>[key,{
    itemSize:a.itemSize,normalized:a.normalized,bytes:Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength).toString('base64'),
   }])),index:mesh.geometry.index?Array.from(mesh.geometry.index.array):null,
   materials:(Array.isArray(mesh.material)?mesh.material:[mesh.material]).map(m=>{const {uuid,metadata,...settings}=m.toJSON();return settings})}:{}),
  })
 })
 return nodes
}
describe('static rental and pavilion instances',()=>{
 it('retains native geometry, material settings, grounding, wheel anchors and labels',()=>{
  const signs={bike:new Texture(),scooter:new Texture()},shared=createSharedBuildingModels(signs)
  const originals={bike:factory('rental-bay',{kind:'bicycle',signTexture:signs.bike}),
   scooter:factory('rental-bay',{kind:'scooter',signTexture:signs.scooter}),
   pavilion:groundObject(factory('sub',{scale:SUB_PAVILION_SCALE}))}
  for(const key of ['bike','scooter','pavilion']as const){
   expect(geometryBytes(shared[key])).toEqual(geometryBytes(originals[key]))
   const first=shared[key].clone(true),second=shared[key].clone(true)
   first.position.x+=100;first.children[0]!.visible=false
   expect(second.position).toEqual(shared[key].position)
   expect(second.children[0]!.visible).toBe(shared[key].children[0]!.visible)
   const a:Mesh[]=[],b:Mesh[]=[]
   first.traverse(o=>{if(o instanceof Mesh)a.push(o)})
   second.traverse(o=>{if(o instanceof Mesh)b.push(o)})
   expect(a.length).toBeGreaterThan(0)
   a.forEach((mesh,i)=>{expect(mesh).not.toBe(b[i]);expect(mesh.geometry).toBe(b[i]!.geometry);expect(mesh.material).toBe(b[i]!.material)})
  }
 },30000)
})
