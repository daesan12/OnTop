import {BoxGeometry,DoubleSide,Mesh,MeshBasicMaterial,Raycaster,Vector3} from 'three'
import {type PropBuilder} from '../world/art/propGeometry'

/** A solid timber seat follows the actual roof, including its low-poly facets. */
export function connectRoof(b:PropBuilder,width:number,depth:number){
 const material=new MeshBasicMaterial({side:DoubleSide})
 const roofs=b.parts.tile.map(g=>new Mesh(g,material))
 const ray=new Raycaster(),heights=new Map<string,number>()
 const topAt=(x:number,z:number)=>{
  const key=x+':'+z,cached=heights.get(key);if(cached!==undefined)return cached
  ray.set(new Vector3(x,20,z),new Vector3(0,-1,0))
  const hit=ray.intersectObjects(roofs,false)[0]
  if(!hit)throw new Error('Missing kiosk roof above its timber seat')
  const top=hit.point.y-.012;heights.set(key,top);return top
 }
 try{
  const thickness=.32,halfX=width/2-.1,halfZ=depth/2-.1
  const add=(minX:number,maxX:number,minZ:number,maxZ:number)=>{
   const g=new BoxGeometry(1,1,1),p=g.getAttribute('position')
   for(let n=0;n<p.count;n++){
    const x=p.getX(n)<0?minX:maxX,z=p.getZ(n)<0?minZ:maxZ
    p.setXYZ(n,x,p.getY(n)<0?4.12:topAt(x,z),z)
   }
   g.computeVertexNormals();b.add('wood',g,'#8b602f')
  }
  for(const side of [-1,1])for(let segment=0;segment<4;segment++){
   const x0=-halfX+segment*halfX/2,x1=x0+halfX/2
   const z0=-halfZ+segment*halfZ/2,z1=z0+halfZ/2
   add(x0,x1,side<0?-halfZ:halfZ-thickness,side<0?-halfZ+thickness:halfZ)
   add(side<0?-halfX:halfX-thickness,side<0?-halfX+thickness:halfX,z0,z1)
  }
 }finally{material.dispose()}
}

export function constructionBoardPosition(depth:number):[number,number,number]{return [0,1.25,depth/2+.8]}
export function constructionBoard(b:PropBuilder,depth:number){
 const [x,y,z]=constructionBoardPosition(depth)
 b.box('wood','#694725',[x,y,z-.10],[2.85,.94,.16])
 for(const side of [-1,1])b.box('wood','#a66e35',[side, .76,z-.17],[.16,1.14,.18])
}
