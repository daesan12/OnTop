import type { BufferGeometry } from 'three'
import { FOUNTAIN, groundHeight } from '../src/config'
import {fountainTerrain} from '../src/layout-preview/districtGeometry'
import {SITES as ORIGINAL,DRAFT_FOUNTAIN} from '../src/layout-preview/layout'
import {fountainAccessHeight} from './fountainAccessSurface'

/** Reuse the original topology and skirt without mutating deployed-map geometry. */
export const renewalFountainTerrain=(()=>{
 const g=fountainTerrain.clone(),p=g.getAttribute('position')
 for(let i=0;i<p.count;i++){
  const dx=p.getX(i)-ORIGINAL.fountain.x,dz=p.getZ(i)-ORIGINAL.fountain.z
  if(Math.hypot(dx,dz)>DRAFT_FOUNTAIN.plazaRadius+.03&&p.getY(i)<0)continue
  p.setY(i,fountainAccessHeight(dx,dz))
 }
 p.needsUpdate=true;g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere()
 return g
})()

const gradedCourses = new WeakMap<BufferGeometry, BufferGeometry>()

/** Keep the mosaic on the bowl surface in both the original and optimized previews. */
export function gradeFountainCourses(source: BufferGeometry) {
 const cached = gradedCourses.get(source)
 if(cached)return cached
 const positions = source.getAttribute('position')
 let result: BufferGeometry | undefined
 for(let i=0;i<positions.count;i++){
  const x=positions.getX(i),z=positions.getZ(i)
  const dx=x-FOUNTAIN.x,dz=z-FOUNTAIN.z,r=Math.hypot(dx,dz)
  // Only the paving tiles use this original surface offset. The curb,
  // lanterns and flowerbeds share the prop but keep their current geometry.
  if(r<5.399||r>13.666||Math.abs(positions.getY(i)-groundHeight(x,z)-.065)>.012)continue
  result??=source.clone()
  const floor=fountainAccessHeight(dx*DRAFT_FOUNTAIN.scale,dz*DRAFT_FOUNTAIN.scale)
  result.getAttribute('position').setY(i,floor+.028)
 }
 if(result){
  result.computeVertexNormals()
  result.computeBoundingBox()
  result.computeBoundingSphere()
 }
 const geometry=result??source
 gradedCourses.set(source,geometry)
 return geometry
}
