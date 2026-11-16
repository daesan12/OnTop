import {Box3,Vector3,Mesh,Matrix3,type Object3D} from 'three'
import { DOCK_REAR_RAIL } from './dockRailPlan'
/** The approved shooting range's complete visual bounds, metres X/Y/Z. */
export const SHOOTING_SIZE=[10.46,6.29,7.02] as const
export const ARCADE_SCALE=[10.1/18,4.1/6.4,7.0/12] as const
export function removeDockRearRopes(root: Object3D) {
 const mesh=root.getObjectByName('deck_and_rental_kiosk_dock_rope')
 if(!(mesh instanceof Mesh)) return
 const g=mesh.geometry.clone(),p=g.getAttribute('position'),index=g.getIndex(),kept:number[]=[]
 const count=index?.count??p.count
 for(let i=0;i<count;i+=3){
  const a=index?.getX(i)??i,b=index?.getX(i+1)??i+1,c=index?.getX(i+2)??i+2
  const x=(p.getX(a)+p.getX(b)+p.getX(c))/3,z=(p.getZ(a)+p.getZ(b)+p.getZ(c))/3
  if(Math.abs(x)<4.24&&Math.abs(z-DOCK_REAR_RAIL.z)<.12)continue
  kept.push(a,b,c)
 }
 g.setIndex(kept)
 mesh.geometry=g
}
export const NATIVE_FORWARD:Record<string,1|-1>={main:-1,fortune:-1,lottery:-1,cafe:-1,dock:-1,boat:-1,bread:1,pigeon:1,folk:1,sub:1}
export const aimedYaw=(kind:string,dx:number,dz:number)=>Math.atan2(dx,dz)+(NATIVE_FORWARD[kind]===-1?Math.PI:0)
/** Widen the side opening, removing obstructing ropes, corner post and lamp on this instance only. */
export function openDockSideEntry<T extends Object3D>(root:T){
 root.updateMatrixWorld(true);let removed=0;const v=new Vector3(),center=new Vector3()
 root.traverse(o=>{if(!(o instanceof Mesh))return;const source=o.geometry,p=source.getAttribute('position'),index=source.getIndex(),count=index?.count??p.count,kept:number[]=[]
  for(let i=0;i<count;i+=3){const ids=[0,1,2].map(k=>index?index.getX(i+k):i+k);center.set(0,0,0);for(const id of ids)center.add(v.fromBufferAttribute(p,id).applyMatrix4(o.matrixWorld));center.multiplyScalar(1/3)
   if(center.x> -4.8&&center.x< -3.8&&center.z>.55&&center.z<3.05&&center.y>.67&&center.y<3.8){removed++;continue}kept.push(...ids)
  }
  if(kept.length<count){o.geometry=source.clone();o.geometry.setIndex(kept);o.geometry.computeBoundingSphere()}
 });root.userData.sideEntryRemovedTriangles=removed;return root
}
/** Fit only the explicitly requested buildings; retain source geometry and materials. */
export function fitApprovedObject<T extends Object3D>(object:T,target:readonly [number,number,number]){
 object.updateMatrixWorld(true);const box=new Box3().setFromObject(object),size=box.getSize(new Vector3()),center=box.getCenter(new Vector3()),ratio=new Vector3(target[0]/size.x,target[1]/size.y,target[2]/size.z)
 object.scale.multiply(ratio);object.position.set(-center.x*ratio.x,-box.min.y*ratio.y,-center.z*ratio.z);object.updateMatrixWorld(true)
 return object
}
export const boatAngleAt = (seconds: number, period: number) => (seconds % period) / period * Math.PI * 2
export function boatPose(angle:number,cx:number,cz:number,rx:number,rz:number){const dx=-Math.sin(angle)*rx,dz=Math.cos(angle)*rz;return{x:cx+Math.cos(angle)*rx,z:cz+Math.sin(angle)*rz,yaw:Math.atan2(dx,dz)+Math.PI,dx,dz}}

export function groundObject<T extends Object3D>(object:T){object.updateMatrixWorld(true);const box=new Box3().setFromObject(object);if(Number.isFinite(box.min.y))object.position.y-=box.min.y;return object}
/** Private booth deformation retains deck, mooring fingers and outer railing. */
export function widenDockRearPassage<T extends Object3D>(root:T){root.updateMatrixWorld(true);root.traverse(o=>{if(!(o instanceof Mesh))return;const source=o.geometry,p=source.getAttribute('position'),g=source.clone(),a=g.getAttribute('position'),v=new Vector3();let changed=false;for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld);if(Math.abs(v.x)<3&&(v.y>.67||Math.abs(Math.abs(v.x)-1.75)<.3&&v.y>.6&&v.z>1.65)&&v.z>-.85&&v.z<2.23){v.z=-.85+(v.z+.85)*.56;o.worldToLocal(v);a.setXYZ(i,v.x,v.y,v.z);changed=true}}if(changed){a.needsUpdate=true;g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();o.geometry=g}else g.dispose()});return root}

/**
 * Turns the rental booth (counter, sign, banners, lamps) 180 degrees in place so it faces the land-side
 * walkway instead of the lake. Deck, mooring fingers, railings and the roof stay; the approved GLB is untouched.
 * Whole triangles move (by centroid), so walls rooted on the deck keep their base vertices.
 */
export const DOCK_BOOTH_TURN={halfX:3,minY:.7,maxY:2.95,minZ:-1.3,maxZ:2.3} as const
export function turnDockBooth<T extends Object3D>(root:T){
 root.updateMatrixWorld(true);let turned=0
 const v=new Vector3(),center=new Vector3(),{halfX,minY,maxY,minZ,maxZ}=DOCK_BOOTH_TURN
 root.traverse(o=>{if(!(o instanceof Mesh))return
  const source=o.geometry.index?o.geometry.toNonIndexed():o.geometry,g=source===o.geometry?source.clone():source,p=g.getAttribute('position'),n=g.getAttribute('normal')
  const toWorld=new Matrix3().getNormalMatrix(o.matrixWorld),toLocal=toWorld.clone().invert()
  let changed=false
  for(let i=0;i<p.count;i+=3){
   center.set(0,0,0);for(let k=0;k<3;k++)center.add(v.fromBufferAttribute(p,i+k).applyMatrix4(o.matrixWorld));center.multiplyScalar(1/3)
   if(Math.abs(center.x)>=halfX||center.y<=minY||center.y>=maxY||center.z<=minZ||center.z>=maxZ)continue
   for(let k=0;k<3;k++){
    v.fromBufferAttribute(p,i+k).applyMatrix4(o.matrixWorld);v.set(-v.x,v.y,-v.z);o.worldToLocal(v);p.setXYZ(i+k,v.x,v.y,v.z)
    if(n){v.fromBufferAttribute(n,i+k).applyMatrix3(toWorld);v.set(-v.x,v.y,-v.z).applyMatrix3(toLocal).normalize();n.setXYZ(i+k,v.x,v.y,v.z)}
   }
   changed=true;turned++
  }
  if(changed){p.needsUpdate=true;if(n)n.needsUpdate=true;else g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();o.geometry=g}else g.dispose()
 })
 root.userData.boothTurnedTriangles=turned;return root
}
