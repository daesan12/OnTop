import { BufferGeometry, Float32BufferAttribute } from 'three'
import { DRAFT_FOUNTAIN, SITES, fountainGroundHeight } from './layout'
import { FOUNTAIN_APPROACH_BLEND_WIDTH } from '../map/park/fountainHeight'

export const FOUNTAIN_PAVING_SEGMENTS = 128
// Cover the tiny difference between the lawn ellipse and the polygonal collar.
export const fountainPavingRadius = DRAFT_FOUNTAIN.plazaRadius+.04
const pathTop = .085

/** Keep the existing terrain profile, with a flush paved collar at every entrance. */
export function fountainPavingHeight(x:number,z:number) {
  const radius=Math.hypot(x-SITES.fountain.x,z-SITES.fountain.z)
  const t=Math.max(0,Math.min(1,(radius-DRAFT_FOUNTAIN.plazaRadius+FOUNTAIN_APPROACH_BLEND_WIDTH)/FOUNTAIN_APPROACH_BLEND_WIDTH))
  const blend=t*t*(3-2*t)
  return (fountainGroundHeight(x,z)+.008)*(1-blend)+pathTop*blend
}

/** Subtract the same convex outline as the sloping plaza, including triangles
 * whose vertices lie outside it. Moving just those vertices leaves flat bridges. */
export function cutFountainFromPaving(source:BufferGeometry) {
  type Point=[number,number]
  const position=source.getAttribute('position'),index=source.index
  const vertices:number[]=[],uv:number[]=[],radius=fountainPavingRadius
  const polygon=Array.from({length:FOUNTAIN_PAVING_SEGMENTS},(_,i):Point=>{
    const angle=i*Math.PI*2/FOUNTAIN_PAVING_SEGMENTS
    return [SITES.fountain.x+Math.cos(angle)*radius,SITES.fountain.z+Math.sin(angle)*radius]
  })
  const emit=(points:Point[])=>{
    for(let n=1;n<points.length-1;n++)for(const [x,z] of [points[0]!,points[n]!,points[n+1]!]){
      vertices.push(x,pathTop,z);uv.push(x/1.2,z/1.2)
    }
  }
  for(let n=0;n<(index?.count??position.count);n+=3){
    let remaining:Point[]=Array.from({length:3},(_,j)=>{
      const k=index?index.getX(n+j):n+j
      return [position.getX(k),position.getZ(k)]
    })
    const xs=remaining.map(p=>p[0]),zs=remaining.map(p=>p[1])
    if(Math.max(...xs)<SITES.fountain.x-radius||Math.min(...xs)>SITES.fountain.x+radius||Math.max(...zs)<SITES.fountain.z-radius||Math.min(...zs)>SITES.fountain.z+radius){emit(remaining);continue}
    for(let edge=0;edge<polygon.length&&remaining.length;edge++){
      const a=polygon[edge]!,b=polygon[(edge+1)%polygon.length]!
      const distance=(p:Point)=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0])
      const inside:Point[]=[],outside:Point[]=[]
      for(let k=0;k<remaining.length;k++){
        const p=remaining[k]!,q=remaining[(k+1)%remaining.length]!,dp=distance(p),dq=distance(q)
        ;(dp>=0?inside:outside).push(p)
        if((dp>=0)!==(dq>=0)){
          const t=dp/(dp-dq),hit:Point=[p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t]
          inside.push(hit);outside.push(hit)
        }
      }
      emit(outside);remaining=inside
    }
  }
  const geometry=new BufferGeometry()
  geometry.setAttribute('position',new Float32BufferAttribute(vertices,3))
  geometry.setAttribute('uv',new Float32BufferAttribute(uv,2))
  geometry.computeVertexNormals();geometry.computeBoundingSphere()
  return geometry
}
