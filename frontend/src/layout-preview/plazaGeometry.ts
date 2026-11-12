import { SIMPLE_MAP } from '../world/art/mapRenderProfile'
import { RingGeometry, Shape, ShapeGeometry, BufferGeometry, Float32BufferAttribute } from 'three'
import { PropBuilder } from '../world/art/propGeometry'
import { LIFE_PLAZA } from './layout'

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
    let poly=Array.from({length:3},(_,j)=>{const n=index.getX(i+j);return [pos.getX(n),-pos.getY(n)]})
    // Clip every tile to the outer disc before subtracting the central mosaic.
    for(let n=0;n<96&&poly.length;n++){
      const a=n*Math.PI/48,b=(n+1)*Math.PI/48,ax=LIFE_PLAZA.x+Math.cos(a)*LIFE_PLAZA.pavingRadius,az=LIFE_PLAZA.z+Math.sin(a)*LIFE_PLAZA.pavingRadius,bx=LIFE_PLAZA.x+Math.cos(b)*LIFE_PLAZA.pavingRadius,bz=LIFE_PLAZA.z+Math.sin(b)*LIFE_PLAZA.pavingRadius
      const inside:number[][]=[],dist=(p:number[])=>(bx-ax)*(p[1]!-az)-(bz-az)*(p[0]!-ax)
      for(let j=0;j<poly.length;j++){const p=poly[j]!,q=poly[(j+1)%poly.length]!,dp=dist(p),dq=dist(q);if(dp>=0)inside.push(p);if((dp>=0)!==(dq>=0)){const t=dp/(dp-dq);inside.push([p[0]!+(q[0]!-p[0]!)*t,p[1]!+(q[1]!-p[1]!)*t])}}
      poly=inside
    }
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
