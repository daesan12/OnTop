import {BufferGeometry,Float32BufferAttribute,Vector3} from 'three'

/** Give an open roof real thickness, with reversed underside and closed boundary faces. */
export function closeSurface(source:BufferGeometry,thickness:number) {
  const p=source.getAttribute('position'),uv=source.getAttribute('uv'),tint=source.getAttribute('color'),indices=source.index
  const positions:number[]=[],uvs:number[]=[],colors:number[]=[],edges=new Map<string,{a:number;b:number;count:number}>()
  const position=(n:number)=>new Vector3(p.getX(n),p.getY(n),p.getZ(n))
  const key=(n:number)=>[p.getX(n),p.getY(n),p.getZ(n)].map(v=>Math.round(v*1e6)).join(',')
  const vertex=(n:number,lower=false)=>{positions.push(p.getX(n),p.getY(n)-(lower?thickness:0),p.getZ(n));uvs.push(uv?.getX(n)??0,uv?.getY(n)??0);colors.push(tint?.getX(n)??1,tint?.getY(n)??1,tint?.getZ(n)??1)}
  const count=indices?.count??p.count
  for(let n=0;n<count;n+=3) {
    const a=indices?.getX(n)??n,b=indices?.getX(n+1)??n+1,c=indices?.getX(n+2)??n+2
    if(position(b).sub(position(a)).cross(position(c).sub(position(a))).lengthSq()<1e-14)continue
    vertex(a);vertex(b);vertex(c);vertex(c,true);vertex(b,true);vertex(a,true)
    for(const [from,to] of [[a,b],[b,c],[c,a]]){
      const ak=key(from!),bk=key(to!),id=ak<bk?ak+'|'+bk:bk+'|'+ak,edge=edges.get(id)
      if(edge)edge.count++;else edges.set(id,{a:from!,b:to!,count:1})
    }
  }
  for(const {a,b,count} of edges.values())if(count===1){vertex(a);vertex(a,true);vertex(b,true);vertex(a);vertex(b,true);vertex(b)}
  const geometry=new BufferGeometry()
  geometry.setAttribute('position',new Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new Float32BufferAttribute(uvs,2));geometry.setAttribute('color',new Float32BufferAttribute(colors,3))
  geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere()
  return geometry
}
