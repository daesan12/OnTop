import {BufferGeometry,Float32BufferAttribute} from 'three'
type Point=[number,number,number]

/** Clip each real roof facet before extending a timber seat down to its beam.
 * Sampling only box corners can bridge across facets and poke above this narrow roof. */
export function createRankingRoofSeats(surfaces:readonly BufferGeometry[]){
 const vertices:number[]=[]
 const regions=[[-4.3,4.3,-.45,-.15],[-4.3,4.3,.15,.45],[-4.3,-4,-.45,.45],[4,4.3,-.45,.45]]
 const clip=(points:Point[],axis:0|2,bound:number,sign:number)=>{
  const result:Point[]=[]
  for(let i=0;i<points.length;i++){
   const a=points[i]!,b=points[(i+1)%points.length]!,da=(a[axis]-bound)*sign,db=(b[axis]-bound)*sign
   if(da>=-1e-8)result.push(a)
   if((da>=0)!==(db>=0)){
    const t=da/(da-db)
    result.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t])
   }
  }
  return result
 }
 for(const geometry of surfaces){
  const p=geometry.getAttribute('position'),index=geometry.index
  for(let n=0;n<(index?.count??p.count);n+=3){
   const triangle=Array.from({length:3},(_,i)=>{const v=index?.getX(n+i)??n+i;return [p.getX(v),p.getY(v),p.getZ(v)] as Point})
   for(const [x0,x1,z0,z1] of regions){
    let poly=clip(triangle,0,x0!,1);poly=clip(poly,0,x1!,-1);poly=clip(poly,2,z0!,1);poly=clip(poly,2,z1!,-1)
    if(poly.length<3)continue
    const area=poly.reduce((sum,a,i)=>{const b=poly[(i+1)%poly.length]!;return sum+a[0]*b[2]-b[0]*a[2]},0)
    if(Math.abs(area)<1e-8)continue
    if(area>0)poly.reverse()
    const top=poly.map(([x,y,z])=>[x,y-.04,z] as Point),bottom=poly.map(([x,,z])=>[x,4.1,z] as Point)
    for(let i=1;i<poly.length-1;i++)vertices.push(...top[0]!,...top[i]!,...top[i+1]!,...bottom[0]!,...bottom[i+1]!,...bottom[i]!)
    for(let i=0;i<poly.length;i++){const j=(i+1)%poly.length;vertices.push(...top[i]!,...bottom[i]!,...top[j]!,...top[j]!,...bottom[i]!,...bottom[j]!)}
   }
  }
 }
 const geometry=new BufferGeometry()
 geometry.setAttribute('position',new Float32BufferAttribute(vertices,3));geometry.computeVertexNormals()
 return geometry
}
