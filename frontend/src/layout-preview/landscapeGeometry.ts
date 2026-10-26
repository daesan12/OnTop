import { BufferGeometry,Float32BufferAttribute,RingGeometry, Shape, ShapeGeometry } from 'three'
import { PropBuilder } from '../world/art/propGeometry'
import type { Part } from '../world/art/Instances'
import { SETTINGS,DRAFT_PAVILIONS,DRAFT_FOUNTAIN,PAVILION_COURT,VR_COURT, FENCE_RUNS,ROUND_COURTS, LIFE_PLAZA, PATHS, PERIMETER, SITES,nearSegment } from './layout'
import { buildPathNetwork } from './pathNetwork'
const routes=[...PATHS,{id:'perimeter',points:PERIMETER,width:SETTINGS.park.perimeterWidth}]
function courtOrPlaza(x:number,z:number) {
  return Math.hypot((x-SITES.cart.x)/4.4,(z-SITES.cart.z)/3.6)<1
    ||Math.abs(x)<LIFE_PLAZA.width/2+.6&&Math.abs(z-LIFE_PLAZA.z)<LIFE_PLAZA.depth/2+.6
    ||DRAFT_PAVILIONS.some(p=>Math.abs(x-p.x)<(p.id==='P0'?14:PAVILION_COURT.width/2+.8)&&Math.abs(z-p.z)<(p.id==='P0'?16.3:PAVILION_COURT.depth/2+.8))
    ||ROUND_COURTS.some(c=>Math.hypot((x-c.x)/(c.rx+.8),(z-c.z)/(c.rz+.8))<1)
    ||Math.abs(x-SITES.pagoda.x)<18&&Math.abs(z-SITES.pagoda.z)<18
    ||Math.abs(x-VR_COURT.x)<VR_COURT.width/2+.5&&Math.abs(z-VR_COURT.z)<VR_COURT.depth/2+.5
    ||Math.hypot((x-SITES.lake.x)/(SITES.lake.rx+1.5),(z-SITES.lake.z)/(SITES.lake.rz+1.5))<1
    ||Math.hypot(x-SITES.fountain.x,z-SITES.fountain.z)<DRAFT_FOUNTAIN.plazaRadius+.7
}
const network=buildPathNetwork(routes)
export const pathPaving=network.geometry
export const pathCurbs:Part[]=[]
for(const edge of network.edges)for(let i=1;i<edge.length;i++) {
  const a=edge[i-1]!,b=edge[i]!,dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),count=Math.ceil(length/.75)
  for(let n=0;n<count;n++) {
    const t=(n+.5)/count,x=a[0]+dx*t,z=a[1]+dz*t
    if(courtOrPlaza(x,z)||routes.some(r=>r.points.slice(1).some((p,k)=>nearSegment(x,z,r.points[k]!,p)<r.width/2-.15)))continue
    pathCurbs.push({p:[x,.13,z],s:[.18,.18,length/count*.95],r:[0,Math.atan2(dx,dz),0],c:'#aaa892'})
  }
}
const fences=new PropBuilder([6,4])
for(const run of FENCE_RUNS) {
  const [x,z]=run.from,dx=run.to[0]-x,dz=run.to[1]-z,length=Math.hypot(dx,dz),yaw=Math.atan2(dx,dz)
  fences.box('stone','#afa58c',[x+dx/2,.1,z+dz/2],[.32,.2,length],[0,yaw,0])
  for(const y of [.38,.95])fences.box('wood','#826b46',[x+dx/2,y,z+dz/2],[.12,.14,length],[0,yaw,0])
  const count=Math.ceil(length/1.9)
  for(let i=0;i<=count;i++) {
    const px=x+dx*i/count,pz=z+dz*i/count
    fences.box('wood','#68553b',[px,.59,pz],[.22,1.18,.22])
    fences.box('tile','#40574a',[px,1.21,pz],[.34,.12,.34])
    if(i<count)for(const fraction of [.33,.67]) {
      fences.box('wood','#a28b5d',[x+dx*(i+fraction)/count,.62,z+dz*(i+fraction)/count],[.075,.6,.075])
    }
  }
}
export const fenceArt=fences.finish()

const plaza=new PropBuilder([8,6])
plaza.box('stone','#b7af99',[LIFE_PLAZA.x,.055,LIFE_PLAZA.z],[LIFE_PLAZA.width,.11,LIFE_PLAZA.depth])
for(let x=LIFE_PLAZA.x-LIFE_PLAZA.width/2+1;x<LIFE_PLAZA.x+LIFE_PLAZA.width/2;x+=2)for(let z=LIFE_PLAZA.z-LIFE_PLAZA.depth/2+1;z<LIFE_PLAZA.z+LIFE_PLAZA.depth/2;z+=2) {
  const tile=new Shape(),loX=Math.max(LIFE_PLAZA.x-LIFE_PLAZA.width/2,x-.97),hiX=Math.min(LIFE_PLAZA.x+LIFE_PLAZA.width/2,x+.97),loZ=Math.max(LIFE_PLAZA.z-LIFE_PLAZA.depth/2,z-.97),hiZ=Math.min(LIFE_PLAZA.z+LIFE_PLAZA.depth/2,z+.97)
  tile.moveTo(loX,-loZ);tile.lineTo(hiX,-loZ);tile.lineTo(hiX,-hiZ);tile.lineTo(loX,-hiZ);tile.closePath()
  // Clip triangles against the circular inlay: no stacked tile faces beneath the disc.
  const g=new ShapeGeometry(tile),pos=g.getAttribute('position'),index=g.getIndex()!,vertices:number[]=[],uvs:number[]=[]
  for(let i=0;i<index.count;i+=3) {
    let poly=Array.from({length:3},(_,j)=>{const n=index.getX(i+j);return [pos.getX(n),-pos.getY(n)]})
    // Subtract a convex 96-sided circle by retaining each outside fragment in turn.
    for(let n=0;n<96&&poly.length;n++) {
      const a=n*Math.PI/48,b=(n+1)*Math.PI/48,ax=LIFE_PLAZA.x+Math.cos(a)*LIFE_PLAZA.radius,az=LIFE_PLAZA.z+Math.sin(a)*LIFE_PLAZA.radius,bx=LIFE_PLAZA.x+Math.cos(b)*LIFE_PLAZA.radius,bz=LIFE_PLAZA.z+Math.sin(b)*LIFE_PLAZA.radius
      const inside:number[][]=[],outside:number[][]=[],dist=(p:number[])=> (bx-ax)*(p[1]!-az)-(bz-az)*(p[0]!-ax)
      for(let j=0;j<poly.length;j++){
        const p=poly[j]!,q=poly[(j+1)%poly.length]!,dp=dist(p),dq=dist(q)
        ;(dp>=0?inside:outside).push(p)
        if((dp>=0)!==(dq>=0)){const t=dp/(dp-dq),r=[p[0]!+(q[0]!-p[0]!)*t,p[1]!+(q[1]!-p[1]!)*t];inside.push(r);outside.push(r)}
      }
      for(let j=1;j<outside.length-1;j++)for(const p of [outside[0]!,outside[j]!,outside[j+1]!]){vertices.push(p[0]!,0,p[1]!);uvs.push(p[0]!,p[1]!)}
      poly=inside
    }
  }
  const clipped=new BufferGeometry();clipped.setAttribute('position',new Float32BufferAttribute(vertices,3));clipped.setAttribute('uv',new Float32BufferAttribute(uvs,2));clipped.computeVertexNormals();g.dispose()
  plaza.add('stone',clipped,(x/2+z/2)%3?'#c8c0ad':'#d5ccb9',[0,.14,0])
}
for(const z of [LIFE_PLAZA.z-LIFE_PLAZA.depth/2+.25,LIFE_PLAZA.z+LIFE_PLAZA.depth/2-.25])plaza.box('stone','#879481',[LIFE_PLAZA.x,.15,z],[LIFE_PLAZA.width,.05,.3])
// The arrival avenue continues the exact block palette, grid and finished height.
for(let x=-4;x<=4;x+=2)for(let z=60;z<=88;z+=2) {
  const lo=Math.max(-4,x-.97),hi=Math.min(4,x+.97)
  plaza.box('stone',(x/2+z/2)%3?'#c8c0ad':'#d5ccb9',[(lo+hi)/2,.122,z],[hi-lo,.035,1.94])
}
for(const x of [-3.9,3.9])plaza.box('stone','#879481',[x,.15,74],[.14,.05,30])
plaza.cylinder('stone','#dfd2b3',[LIFE_PLAZA.x,.12,LIFE_PLAZA.z],LIFE_PLAZA.radius,LIFE_PLAZA.radius,.04,[0,0,0],96)
// Flush, concentric stone inlays and a compass-flower mosaic leave the centre walkable.
for(const [radius,width,color] of [[7.2,.2,'#8d9b86'],[6.85,.08,'#a58b59'],[5.3,.12,'#819184']] as const) {
  plaza.add('stone',new RingGeometry(radius-width/2,radius+width/2,96),color,[LIFE_PLAZA.x,.143,LIFE_PLAZA.z],[1,1,1],[-Math.PI/2,0,0])
}
for(let i=0;i<8;i++) {
  const a=i*Math.PI/4,s=new Shape()
  s.moveTo(0,0);s.lineTo(-.65,2.8);s.lineTo(0,4.8);s.lineTo(.65,2.8);s.closePath()
  plaza.add('stone',new ShapeGeometry(s),i%2?'#b09b74':'#819285',[LIFE_PLAZA.x,.146,LIFE_PLAZA.z],[1,1,1],[-Math.PI/2,0,a])
}
plaza.cylinder('stone','#d9ceb0',[LIFE_PLAZA.x,.148,LIFE_PLAZA.z],.75,.75,.008,[0,0,0],32)
for(let i=0;i<32;i++) {
  const a=i*Math.PI/16
  plaza.box('stone','#b1a17f',[Math.cos(a)*6.35,.146,LIFE_PLAZA.z+Math.sin(a)*6.35],[.06,.018,.4],[0,Math.PI/2-a,0])
}
export const plazaArt=plaza.finish()
