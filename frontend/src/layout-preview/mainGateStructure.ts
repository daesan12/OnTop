import { BufferGeometry,Float32BufferAttribute } from 'three'
import type { PropBuilder,XYZ } from '../world/art/propGeometry'

/** Clip the actual roof facets and extrude them down to the lintel. Sampling
 * only the seat's corners can interpolate timber through a low-poly roof. */
export function connectGateRoof(b:PropBuilder,width:number,depth:number){
  const vertices:number[]=[],baseY=4.23
  const add=(...points:XYZ[])=>{for(const p of points)vertices.push(...p)}
  for(const g of b.parts.tile){
    // Closed ridge rolls and the finial include downward normals; only the
    // four upward-facing roof sheets define the timber's upper surface.
    const normals=g.getAttribute('normal')
    let roofSheet=true
    for(let i=0;i<normals.count;i++)if(normals.getY(i)<-1e-6){roofSheet=false;break}
    if(!roofSheet)continue
    const p=g.getAttribute('position'),index=g.getIndex(),count=index?.count??p.count
    for(let n=0;n<count;n+=3){
      let polygon:XYZ[]=Array.from({length:3},(_,i)=>{
        const v=index?index.getX(n+i):n+i
        return [p.getX(v),p.getY(v),p.getZ(v)]
      })
      for(const [axis,sign,limit] of [[0,1,width/2],[0,-1,width/2],[2,1,depth/2],[2,-1,depth/2]] as const){
        const clipped:XYZ[]=[]
        for(let i=0;i<polygon.length;i++){
          const a=polygon[i]!,c=polygon[(i+1)%polygon.length]!
          const da=limit-sign*a[axis],dc=limit-sign*c[axis]
          if(da>=0)clipped.push(a)
          if((da>=0)!==(dc>=0)){
            const t=da/(da-dc)
            clipped.push([a[0]+(c[0]-a[0])*t,a[1]+(c[1]-a[1])*t,a[2]+(c[2]-a[2])*t])
          }
        }
        polygon=clipped
      }
      if(polygon.length<3)continue
      const top=polygon.map(([x,y,z]):XYZ=>[x,y-.006,z]),bottom=polygon.map(([x,,z]):XYZ=>[x,baseY,z])
      for(let i=1;i<polygon.length-1;i++){add(top[0]!,top[i]!,top[i+1]!);add(bottom[0]!,bottom[i+1]!,bottom[i]!)}
      for(let i=0;i<polygon.length;i++){
        const j=(i+1)%polygon.length
        add(top[i]!,bottom[i]!,top[j]!,top[j]!,bottom[i]!,bottom[j]!)
      }
    }
  }
  const seat=new BufferGeometry()
  seat.setAttribute('position',new Float32BufferAttribute(vertices,3));seat.computeVertexNormals()
  b.add('wood',seat,'#986d47')
}
