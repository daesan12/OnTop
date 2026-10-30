import {BufferGeometry,Color,Float32BufferAttribute} from 'three'
type Point=[number,number]
const SEGMENTS=128
function clipToEllipse(input:Point[],outline:Point[]) {
  let polygon=input
  for(let n=0;n<outline.length&&polygon.length;n++) {
    const a=outline[n]!,b=outline[(n+1)%outline.length]!,next:Point[]=[]
    const side=(p:Point)=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0])
    let previous=polygon.at(-1)!,before=side(previous)
    for(const current of polygon) {
      const after=side(current),inside=after>=-1e-9,wasInside=before>=-1e-9
      if(inside!==wasInside){const t=before/(before-after);next.push([previous[0]+(current[0]-previous[0])*t,previous[1]+(current[1]-previous[1])*t])}
      if(inside)next.push(current)
      previous=current;before=after
    }
    polygon=next
  }
  return polygon
}

/** Flat clipped pavers, grout and a continuous stone border share one mesh and no textures. */
export function createFitnessPaving(width:number,depth:number,floorColor='#c8c0ad') {
  const rx=width/2,rz=depth/2,band=.65,top=.1,positions:number[]=[],colors:number[]=[],base=new Color(floorColor)
  const ellipse=(x:number,z:number)=>Array.from({length:SEGMENTS},(_,n):Point=>[Math.cos(n*Math.PI*2/SEGMENTS)*x,Math.sin(n*Math.PI*2/SEGMENTS)*z])
  const inner=ellipse(rx-band,rz-band),outer=ellipse(rx,rz)
  const palette=[.96,1.02,.92,1,.98].map(s=>base.clone().multiplyScalar(s)),grout=base.clone().multiplyScalar(.76),edge=base.clone().multiplyScalar(.81)
  const vertex=(p:Point,y:number,c:Color)=>{positions.push(p[0],y,p[1]);colors.push(c.r,c.g,c.b)}
  const polygon=(points:Point[],y:number,c:Color,up=true)=>{
    if(points.length<3)return false
    let area=0
    for(let n=1;n<points.length-1;n++) {
      const a=points[0]!,b=points[n]!,d=points[n+1]!,cross=(b[0]-a[0])*(d[1]-a[1])-(b[1]-a[1])*(d[0]-a[0])
      if(Math.abs(cross)<1e-9)continue
      vertex(a,y,c);vertex(up?d:b,y,c);vertex(up?b:d,y,c);area+=Math.abs(cross)/2
    }
    return area>1e-8
  }
  const rectangle=(x0:number,z0:number,x1:number,z1:number,c:Color)=>polygon(clipToEllipse([[x0,z0],[x1,z0],[x1,z1],[x0,z1]],inner),top,c)
  let tileCount=0
  const w=1.6,d=1.2,gap=.018
  for(let row=-Math.ceil(rz/d);row<=Math.ceil(rz/d);row++)for(let col=-Math.ceil(rx/w)-1;col<=Math.ceil(rx/w);col++){
    const x=col*w+(Math.abs(row)%2)*w/2,z=row*d
    // Five non-overlapping regions cover each cell at exactly the same height.
    rectangle(x,z,x+gap,z+d,grout);rectangle(x+w-gap,z,x+w,z+d,grout)
    rectangle(x+gap,z,x+w-gap,z+gap,grout);rectangle(x+gap,z+d-gap,x+w-gap,z+d,grout)
    if(rectangle(x+gap,z+gap,x+w-gap,z+d-gap,palette[Math.abs(row*3+col)%palette.length]!))tileCount++
  }
  for(let n=0;n<SEGMENTS;n++) {
    const j=(n+1)%SEGMENTS,a=inner[n]!,b=inner[j]!,c=outer[n]!,e=outer[j]!
    polygon([a,c,e,b],top,n%8<4?edge:palette[2]!)
    vertex(c,0,edge);vertex(c,top,edge);vertex(e,top,edge)
    vertex(c,0,edge);vertex(e,top,edge);vertex(e,0,edge)
  }
  polygon(outer,0,edge,false)
  const geometry=new BufferGeometry()
  geometry.setAttribute('position',new Float32BufferAttribute(positions,3));geometry.setAttribute('color',new Float32BufferAttribute(colors,3));geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere()
  return {geometry,tileCount,triangleCount:positions.length/9,top,segments:SEGMENTS}
}
