import { BufferGeometry, CatmullRomCurve3, ExtrudeGeometry, Float32BufferAttribute, Shape, ShapeGeometry, SphereGeometry, TorusGeometry, TubeGeometry, Vector3 } from 'three'
import { PropBuilder, type PropFinish, type XYZ } from './propGeometry'
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'

/** Small, authored bevels survive the generic park primitive simplifier. */
export function carvedBox(b: PropBuilder, finish: PropFinish, color: string, at: XYZ, size: XYZ, bevel = .008, rotation: XYZ = [0,0,0]) {
  const [w,h,d] = size, r = Math.min(bevel,w/5,h/5,d/5)
  const outline = new Shape()
  outline.moveTo(-w/2+r,-h/2+r); outline.lineTo(w/2-r,-h/2+r)
  outline.lineTo(w/2-r,h/2-r); outline.lineTo(-w/2+r,h/2-r); outline.closePath()
  const geometry = new ExtrudeGeometry(outline,{ depth:d-2*r,bevelEnabled:true,bevelThickness:r,bevelSize:r,bevelSegments:1,steps:1,curveSegments:1 })
  geometry.translate(0,0,-d/2+r)
  const position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal'), uv = geometry.getAttribute('uv')
  const alongX = w > h * 1.8
  for(let i=0;i<position.count;i++) {
    const horizontal = Math.abs(normal.getX(i)) > .8 ? position.getZ(i) : position.getX(i)
    uv.setXY(i,alongX ? position.getY(i)*5 : horizontal*5,alongX ? position.getX(i)*2 : position.getY(i)*2)
  }
  const indexed = mergeVertices(geometry, 1e-6)
  geometry.dispose()
  b.add(finish,indexed,color,at,[1,1,1],rotation)
}
export function fineCurve(b: PropBuilder, finish: PropFinish, color: string, points: XYZ[], radius: number, segments = 8) {
  const fine = radius < .0015
  b.add(finish,new TubeGeometry(new CatmullRomCurve3(points.map(p=>new Vector3(...p))),fine ? Math.min(segments,3) : segments,radius,fine ? 3 : 6,false),color)
}
export function softBall(b: PropBuilder, finish: PropFinish, color: string, at: XYZ, size: XYZ) {
  // Generic BufferGeometry intentionally retains the small 12 x 8 sculpted silhouette.
  const source = new SphereGeometry(1,12,8), smooth = new BufferGeometry().copy(source)
  source.dispose()
  b.add(finish,smooth,color,at,size)
}
export function blossom(b: PropBuilder, finish: PropFinish, color: string, x: number, y: number, z: number, radius: number) {
  const shape = new Shape()
  for(let i=0;i<=40;i++) {
    const a=i*Math.PI/20,r=radius*(.78+.22*Math.cos(5*a))
    if(i)shape.lineTo(x+Math.cos(a)*r,y+Math.sin(a)*r);else shape.moveTo(x+r,y)
  }
  shape.closePath();b.add(finish,new ShapeGeometry(shape,2),color,[0,0,z])
  b.ball('gold','#d3ad62',[x,y,z+.005],[radius*.19,radius*.19,.003])
}
export function reliefPagoda(b: PropBuilder,x:number,y:number,z:number,s:number,color:string,finish:PropFinish='gold') {
  carvedBox(b,finish,color,[x,y,z],[.32*s,.025*s,.012],.002)
  for(let tier=0;tier<3;tier++){
    const level=y+(.049+tier*.065)*s,w=(.27-tier*.06)*s
    carvedBox(b,finish,color,[x,level+.025*s,z],[w*.5,.045*s,.014],.002)
    fineCurve(b,finish,color,[[x-w/2,level+.006*s,z+.007],[x-w*.24,level-.004*s,z+.007],[x+w*.24,level-.004*s,z+.007],[x+w/2,level+.006*s,z+.007]],.009*s,6)
  }
  b.cylinder(finish,color,[x,y+.254*s,z],.007*s,.018*s,.055*s)
}
interface Roof { width:number; depth:number; ridge:number; eave:number; rolls:number; detailed:boolean; redEnds?:boolean }
/** Real concave field tiles, overlapping half-round covers, curved eaves and end medallions. */
export function giwaRoof(b:PropBuilder,{width,depth,ridge,eave,rolls,detailed,redEnds}:Roof) {
  const hw=width/2,hd=depth/2,count=detailed?rolls:Math.max(3,Math.ceil(rolls*.6)),rows=detailed?3:1
  const height=(x:number,z:number)=>eave+(ridge-eave)*Math.pow(1-Math.abs(z)/hd,1.65)+.018*Math.pow(Math.abs(x)/hw,5)
  const step=(width-.07)/(count-1), xAt=(i:number)=>-hw+.035+i*step
  for(const side of [-1,1]) {
    for(let col=0;col<count-1;col++)for(let row=0;row<rows;row++) {
      const positions:number[]=[],indices:number[]=[],nx=3,nz=2
      for(let iz=0;iz<=nz;iz++)for(let ix=0;ix<=nx;ix++) {
        const u=ix/nx,x=xAt(col)+step*u,z=side*hd*(row+iz/nz)/rows
        positions.push(x,height(x,z)-.016*Math.sin(Math.PI*u)+.002*row,z)
      }
      for(let iz=0;iz<nz;iz++)for(let ix=0;ix<nx;ix++){
        const a=iz*(nx+1)+ix,c=a+nx+1;indices.push(a,c,a+1,a+1,c,c+1)
      }
      const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals()
      b.add('tile',g,(row+col)%2?'#444b57':'#3d4552')
    }
    for(let col=0;col<count;col++)for(let row=0;row<rows;row++) {
      const x=xAt(col),radius=Math.min(.043,step*.30),positions:number[]=[],indices:number[]=[],na=detailed?6:5,nz=3
      for(let iz=0;iz<=nz;iz++)for(let ia=0;ia<=na;ia++) {
        const t=iz/nz,z=side*Math.min(hd,(row+t)/rows*hd),angle=ia/na*Math.PI,lip=t>.78?1.10:1
        positions.push(x+Math.cos(angle)*radius*lip,height(x,z)+.006+Math.sin(angle)*radius*lip,z)
      }
      for(let iz=0;iz<nz;iz++)for(let ia=0;ia<na;ia++){const a=iz*(na+1)+ia,c=a+na+1;indices.push(a,a+1,c,a+1,c+1,c)}
      const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();b.add('tile',g,(col+row)%2?'#535866':'#424954')
      if(detailed && row<rows-1){const z=side*hd*(row+1)/rows;b.add('tile',new TorusGeometry(radius*1.08,.0022,3,8,Math.PI),'#77716d',[x,height(x,z)+.006,z])}
    }
    for(let col=0;col<count;col++) {
      const x=xAt(col),radius=Math.min(.043,step*.30),z=side*(hd+.004),y=height(x,hd)+.008
      b.cylinder('tile','#626575',[x,y,z],radius*1.12,radius*1.12,.018,[Math.PI/2,0,0],8)
      if(detailed) {
        b.add('stone',new TorusGeometry(radius*.78,.0024,3,12),'#8a8073',[x,y,z+side*.011])
        blossom(b,'stone','#8e8171',x,y,z+side*.012,radius*.31)
      }
    }
    const edge=Array.from({length:9},(_,i):XYZ=>{const x=-hw+.012+(width-.024)*i/8;return[x,height(x,hd)-.016,side*hd]})
    fineCurve(b,'wood','#654733',edge,.016,detailed?12:6)
  }
  fineCurve(b,'tile','#515866',[[-hw+.012,ridge+.041,0],[-hw*.5,ridge+.017,0],[0,ridge+.012,0],[hw*.5,ridge+.017,0],[hw-.012,ridge+.041,0]],.026,detailed?12:5)
  for(const side of [-1,1]){
    const points=Array.from({length:9},(_,i):XYZ=>{const z=-hd+depth*i/8;return[side*(hw-.018),height(side*hw,z)-.025,z]})
    fineCurve(b,'wood',redEnds?'#9b2e24':'#735037',points,.027,detailed?12:6)
    if(redEnds)carvedBox(b,'wood','#b9382a',[side*(hw-.055),ridge+.017,0],[.068,.097,.079],.012)
  }
}
export function leaf(b:PropBuilder,x:number,y:number,z:number,size:number,angle:number,color='#65783f') {
  const s=new Shape();s.moveTo(0,-size);s.quadraticCurveTo(size*.85,-size*.25,0,size);s.quadraticCurveTo(-size*.85,-size*.25,0,-size)
  b.add('stone',new ShapeGeometry(s,4),color,[x,y,z],[1,1,1],[.2,0,angle])
}
export function paperSlip(b:PropBuilder,at:XYZ,w:number,h:number,angle:number,color:string,detailed:boolean) {
  const p:number[]=[],indices:number[]=[],n=detailed?3:1
  for(let y=0;y<=n;y++)for(let x=0;x<=n;x++)p.push((x/n-.5)*w,(.5-y/n)*h,.006+Math.pow(y/n,3)*(.008+.009*Math.pow(Math.abs(x/n-.5)*2,2)))
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){const a=y*(n+1)+x,c=a+n+1;indices.push(a,c,a+1,a+1,c,c+1)}
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(p,3));g.setIndex(indices);g.computeVertexNormals();b.add('stone',g,color,at,[1,1,1],[0,0,angle])
}
