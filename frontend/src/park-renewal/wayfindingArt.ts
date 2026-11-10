import {BufferGeometry,Float32BufferAttribute,type Group,type Mesh} from 'three'
import type {SIGNPOSTS} from './landscapePlan'
type Sign=typeof SIGNPOSTS[number]
/** Rotate each arrow board and its two readable label faces; preserve the approved central post. */
export function orientWayfinding(group:Group,sign:Sign){
 const levels=sign.boards.length===1?[1.6]:[2.2,1.61,1.02]
 group.traverse(o=>{
  if(!(o as Mesh).isMesh)return;const mesh=o as Mesh
  if(mesh.userData.text!==undefined){const i=levels.findIndex(y=>Math.abs(mesh.position.y-y)<.1);if(i<0)return;const yaw=sign.boards[i]!.yaw,c=Math.cos(yaw),s=Math.sin(yaw),x=mesh.position.x,z=mesh.position.z+.13;mesh.position.x=c*x+s*z;mesh.position.z=-s*x+c*z-.13;mesh.rotation.y+=yaw;return}
  const source=mesh.geometry,index=source.getIndex(),p=source.getAttribute('position'),names=Object.keys(source.attributes),out=Object.fromEntries(names.map(name=>[name,[]as number[]])),count=index?.count??p.count
  for(let k=0;k<count;k+=3){const ids=[0,1,2].map(j=>index?index.getX(k+j):k+j),i=levels.findIndex(y=>ids.every(n=>Math.abs(p.getY(n)-y)<.32)&&ids.some(n=>Math.abs(p.getX(n))>.2))
   const yaw=i<0?0:sign.boards[i]!.yaw,c=Math.cos(yaw),s=Math.sin(yaw)
   for(const n of ids)for(const name of names){const a=source.getAttribute(name),v=Array.from({length:a.itemSize},(_,j)=>a.array[n*a.itemSize+j]as number);if(name==='position'||name==='normal'){const x=v[0]!,z=v[2]!+(name==='position'?.13:0);v[0]=c*x+s*z;v[2]=-s*x+c*z-(name==='position'?.13:0)}out[name]!.push(...v)}
  }
  const g=new BufferGeometry();for(const name of names)g.setAttribute(name,new Float32BufferAttribute(out[name]!,source.getAttribute(name).itemSize));g.computeBoundingBox();g.computeBoundingSphere();mesh.geometry=g;source.dispose()
 });group.userData={...group.userData,directions:sign.boards.map(b=>({label:b.label,target:b.target,yaw:b.yaw}))};return group
}
