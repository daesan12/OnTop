import {fountainTerrain} from '../layout-preview/districtGeometry'
import {SITES as ORIGINAL,DRAFT_FOUNTAIN} from '../layout-preview/layout'
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
