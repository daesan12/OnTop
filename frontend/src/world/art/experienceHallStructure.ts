import {BoxGeometry,DoubleSide,Mesh,MeshBasicMaterial,Raycaster,Vector3} from 'three'
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js'
import type {PropBuilder} from './propGeometry'
import {closeSurface} from './closedSurface'

/** Tie the existing posts/header into the actual faceted roof without closing the doorway. */
export function connectExperienceHall(b:PropBuilder) {
  if(!b.parts.tile.length)return // A production bake already contains the complete structure.
  const material=new MeshBasicMaterial({side:DoubleSide}),roof=b.parts.tile.map(g=>new Mesh(g,material)),ray=new Raycaster()
  const roofAt=(x:number,z:number)=>{
    ray.set(new Vector3(x,12,z),new Vector3(0,-1,0))
    const hit=ray.intersectObjects(roof,false)[0]
    if(!hit)throw new Error('Missing VR/folk hall roof above header')
    return hit.point.y-.10
  }
  const hx=6.28,hz0=-4.36,hz1=3.86,wall=.23
  const fill=(x0:number,x1:number,z0:number,z1:number)=>{
    const g=new BoxGeometry(1,1,1),p=g.getAttribute('position')
    for(let n=0;n<p.count;n++){
      const x=p.getX(n)<0?x0:x1,z=p.getZ(n)<0?z0:z1
      p.setXYZ(n,x,p.getY(n)<0?3.54:roofAt(x,z),z)
    }
    g.computeVertexNormals();b.add('wood',g,'#8d6345')
  }
  try {
    for(let n=0;n<6;n++) {
      const x0=-hx+n*hx/3,x1=-hx+(n+1)*hx/3,z0=hz0+(hz1-hz0)*n/6,z1=hz0+(hz1-hz0)*(n+1)/6
      fill(x0,x1,hz0,hz0+wall);fill(x0,x1,hz1-wall,hz1)
      fill(-hx,-hx+wall,z0,z1);fill(hx-wall,hx,z0,z1)
    }
    b.box('wood','#7a5140',[0,3.36,-4.3],[12.5,.40,.20])
    for(const side of [-1,1])for(let z=-3.6;z<3.8;z+=1.2)b.box('wood','#ac784d',[side*6.2,3.17,z],[.15,1.12,.12])
    const merged=mergeGeometries(b.parts.tile,false)!,closed=closeSurface(merged,.14)
    merged.dispose();b.parts.tile.forEach(g=>g.dispose());b.parts.tile=[closed]
  }finally{material.dispose()}
}
