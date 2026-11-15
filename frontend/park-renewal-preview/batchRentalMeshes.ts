import {InstancedMesh,Matrix4,Mesh,SkinnedMesh,type BufferGeometry,type Group} from 'three'
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js'

/** Combine compatible static surfaces inside one bay so each placement can still be culled. */
export function batchRentalMeshes(root:Group){
 root.updateMatrixWorld(true)
 const worldToBay=new Matrix4().copy(root.matrixWorld).invert()
 const buckets=new Map<string,Mesh[]>()

 root.traverseVisible(object=>{
  if(!(object instanceof Mesh)||object instanceof InstancedMesh||object instanceof SkinnedMesh||object.children.length) return
  const {material,geometry}=object
  // Transparent signs keep their own position for depth sorting.
  if(Array.isArray(material)||material.transparent||!material.visible||geometry.drawRange.start!==0||
   geometry.drawRange.count!==Infinity||Object.keys(geometry.morphAttributes).length) return
  const attributes=Object.keys(geometry.attributes).sort().map(name=>{
   const attribute=geometry.getAttribute(name)
   return [name,attribute.itemSize,attribute.normalized,attribute.array.constructor.name]
  })
  const {uuid,metadata,name,...finish}=material.toJSON()
  const key=JSON.stringify([finish,attributes,!!geometry.index,object.castShadow,object.receiveShadow,object.renderOrder,object.layers.mask])
  const bucket=buckets.get(key)??[]
  bucket.push(object)
  buckets.set(key,bucket)
 })

 for(const meshes of buckets.values()){
  if(meshes.length<2) continue
  const first=meshes[0]!
  const parts:BufferGeometry[]=meshes.map(mesh=>{
   const transform=new Matrix4().multiplyMatrices(worldToBay,mesh.matrixWorld)
   return mesh.geometry.clone().applyMatrix4(transform)
  })
  const geometry=mergeGeometries(parts)
  parts.forEach(part=>part.dispose())
  if(!geometry) continue
  geometry.computeBoundingSphere()
  const merged=new Mesh(geometry,first.material)
  merged.name=first.name+'-batch'
  merged.castShadow=first.castShadow
  merged.receiveShadow=first.receiveShadow
  merged.renderOrder=first.renderOrder
  merged.layers.mask=first.layers.mask
  root.add(merged)
  for(const mesh of meshes){
   mesh.removeFromParent()
   mesh.geometry.dispose()
  }
 }

 return root
}
