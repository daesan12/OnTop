import { SIMPLE_MAP } from '../world/art/mapRenderProfile'
import { RingGeometry, Shape, ShapeGeometry, BufferGeometry, Float32BufferAttribute } from 'three'
import { PropBuilder } from '../world/art/propGeometry'
import { LIFE_PLAZA } from './layout'

type Point = [number, number]
function circleEdges(radius: number) {
  return Array.from({ length: 96 }, (_, n) => {
    const a = n * Math.PI / 48, b = (n + 1) * Math.PI / 48
    const x = LIFE_PLAZA.x + Math.cos(a) * radius, z = LIFE_PLAZA.z + Math.sin(a) * radius
    const bx = LIFE_PLAZA.x + Math.cos(b) * radius, bz = LIFE_PLAZA.z + Math.sin(b) * radius
    return { x, z, dx: bx - x, dz: bz - z }
  })
}

const outerEdges = circleEdges(LIFE_PLAZA.pavingRadius)
const mosaicEdges = circleEdges(LIFE_PLAZA.radius)
const outerApothemSquared = (LIFE_PLAZA.pavingRadius * Math.cos(Math.PI / outerEdges.length) - 0.001) ** 2
const distances: number[] = []
const empty: Point[] = []

function splitPolygon(polygon: Point[], { x, z, dx, dz }: ReturnType<typeof circleEdges>[number], keepOutside: boolean) {
  let insideCount = 0
  for (let i = 0; i < polygon.length; i++) {
    const [px, pz] = polygon[i]!
    const distance = dx * (pz - z) - dz * (px - x)
    distances[i] = distance
    if (distance >= 0) insideCount++
  }
  if (insideCount === polygon.length) return { inside: polygon, outside: empty }
  if (insideCount === 0) return { inside: empty, outside: keepOutside ? polygon : empty }

  const inside: Point[] = [], outside: Point[] = []
  for (let i = 0; i < polygon.length; i++) {
    const next = (i + 1) % polygon.length
    const p = polygon[i]!, q = polygon[next]!, dp = distances[i]!, dq = distances[next]!
    if (dp >= 0) inside.push(p)
    else if (keepOutside) outside.push(p)
    if ((dp >= 0) !== (dq >= 0)) {
      const t = dp / (dp - dq)
      const intersection: Point = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]
      inside.push(intersection)
      if (keepOutside) outside.push(intersection)
    }
  }
  return { inside, outside }
}

const plaza=new PropBuilder([8,6])
// Pale limestone stays bright under the shared day/night lighting.
plaza.cylinder('stone','#eeeae0',[LIFE_PLAZA.x,.055,LIFE_PLAZA.z],LIFE_PLAZA.pavingRadius,LIFE_PLAZA.pavingRadius,.11,[0,0,0],128)
for(let x=LIFE_PLAZA.x-LIFE_PLAZA.width/2+1;x<LIFE_PLAZA.x+LIFE_PLAZA.width/2;x+=2)for(let z=LIFE_PLAZA.z-LIFE_PLAZA.depth/2+1;z<LIFE_PLAZA.z+LIFE_PLAZA.depth/2;z+=2) {
  if(SIMPLE_MAP)continue
  const tile=new Shape(),loX=Math.max(LIFE_PLAZA.x-LIFE_PLAZA.width/2,x-.97),hiX=Math.min(LIFE_PLAZA.x+LIFE_PLAZA.width/2,x+.97),loZ=Math.max(LIFE_PLAZA.z-LIFE_PLAZA.depth/2,z-.97),hiZ=Math.min(LIFE_PLAZA.z+LIFE_PLAZA.depth/2,z+.97)
  tile.moveTo(loX,-loZ);tile.lineTo(hiX,-loZ);tile.lineTo(hiX,-hiZ);tile.lineTo(loX,-hiZ);tile.closePath()
  // Clip triangles against the circular inlay: no stacked tile faces beneath the disc.
  const g=new ShapeGeometry(tile),pos=g.getAttribute('position'),index=g.getIndex()!,vertices:number[]=[],uvs:number[]=[]
  for(let i=0;i<index.count;i+=3) {
    let poly=Array.from({length:3},(_,j): Point=>{const n=index.getX(i+j);return [pos.getX(n),-pos.getY(n)]})
    // Clip every tile to the outer disc before subtracting the central mosaic.
    // A triangle inside the inscribed circle is inside every clipping edge.
    if (!poly.every(([px, pz]) => (px - LIFE_PLAZA.x) ** 2 + (pz - LIFE_PLAZA.z) ** 2 < outerApothemSquared)) {
      for (const edge of outerEdges) {
        if (!poly.length) break
        poly = splitPolygon(poly, edge, false).inside
      }
    }
    // Subtract a convex 96-sided circle by retaining each outside fragment in turn.
    for (const edge of mosaicEdges) {
      if (!poly.length) break
      const { inside, outside } = splitPolygon(poly, edge, true)
      for(let j=1;j<outside.length-1;j++)for(const p of [outside[0]!,outside[j]!,outside[j+1]!]){vertices.push(p[0]!,0,p[1]!);uvs.push(p[0]!,p[1]!)}
      poly=inside
    }
  }
  const clipped=new BufferGeometry();clipped.setAttribute('position',new Float32BufferAttribute(vertices,3));clipped.setAttribute('uv',new Float32BufferAttribute(uvs,2));clipped.computeVertexNormals();g.dispose()
  plaza.add('stone',clipped,(x/2+z/2)%3?'#eeeae0':'#f5f1e8',[0,.14,0])
}
for(const [r,w] of [[LIFE_PLAZA.pavingRadius-.22,.4],[LIFE_PLAZA.pavingRadius-1,.08]])plaza.add('stone',new RingGeometry(r!-w!/2,r!+w!/2,128),'#a5b7ac',[LIFE_PLAZA.x,.145,LIFE_PLAZA.z],[1,1,1],[-Math.PI/2,0,0])
// The arrival avenue continues the exact block palette, grid and finished height.
for(let x=-4;x<=4;x+=2)for(let z=70;z<=88;z+=2) {
  if(SIMPLE_MAP)continue
  const lo=Math.max(-4,x-.97),hi=Math.min(4,x+.97)
  plaza.box('stone',(x/2+z/2)%3?'#eeeae0':'#f5f1e8',[(lo+hi)/2,.122,z],[hi-lo,.035,1.94])
}
for(const x of [-3.9,3.9])plaza.box('stone','#a5b7ac',[x,.15,79],[.14,.05,20])
plaza.cylinder('stone','#f5f1e6',[LIFE_PLAZA.x,.12,LIFE_PLAZA.z],LIFE_PLAZA.radius,LIFE_PLAZA.radius,.04,[0,0,0],96)
// Flush, concentric stone inlays and a compass-flower mosaic leave the centre walkable.
for(const [radius,width,color] of [[7.2,.2,'#a5b7ac'],[6.85,.08,'#c6ba97'],[5.3,.12,'#9eb2a8']] as const) {
  plaza.add('stone',new RingGeometry(radius-width/2,radius+width/2,96),color,[LIFE_PLAZA.x,.143,LIFE_PLAZA.z],[1,1,1],[-Math.PI/2,0,0])
}
for(let i=0;i<8;i++) {
  const a=i*Math.PI/4,s=new Shape()
  s.moveTo(0,0);s.lineTo(-.65,2.8);s.lineTo(0,4.8);s.lineTo(.65,2.8);s.closePath()
  plaza.add('stone',new ShapeGeometry(s),i%2?'#c6ba97':'#9eb2a8',[LIFE_PLAZA.x,.146,LIFE_PLAZA.z],[1,1,1],[-Math.PI/2,0,a])
}
plaza.cylinder('stone','#f5f1e6',[LIFE_PLAZA.x,.148,LIFE_PLAZA.z],.75,.75,.008,[0,0,0],32)
for(let i=0;i<32;i++) {
  const a=i*Math.PI/16
  plaza.box('stone','#b9ad8d',[Math.cos(a)*6.35,.146,LIFE_PLAZA.z+Math.sin(a)*6.35],[.06,.018,.4],[0,Math.PI/2-a,0])
}
export const plazaArt=plaza.finish()
