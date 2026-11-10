import {BufferGeometry,CatmullRomCurve3,CylinderGeometry,ExtrudeGeometry,Float32BufferAttribute,IcosahedronGeometry,LatheGeometry,Matrix4,Mesh,MeshBasicMaterial,Path,Raycaster,Shape,SphereGeometry,TorusGeometry,TubeGeometry,Vector2,Vector3} from 'three'
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js'
import {PropBuilder,type PropFinish,type XYZ} from '../../../../../../../../world/art/propGeometry.ts'
import {roundShopVolume} from '../../../../../../../../world/art/parkShopMascots.ts'
import {moleShopRocks,recreationMachines,type RecreationFacility} from '../../../../../../../../map/park/recreation.ts'
import {SIMPLE_MAP} from '../../../../../../../../world/art/mapRenderProfile.ts'
import {MOLE_DEMO_DIMENSIONS as DEMO} from './moleDemoDimensions'

const soil='#b47b57',earth='#996044',timber='#946034',dark='#60412d',tile='#4c5059',cream='#f4d397',gold='#dca64d'
function line(b:PropBuilder,color:string,points:XYZ[],radius:number){
 b.add('paint',new TubeGeometry(new CatmullRomCurve3(points.map(p=>new Vector3(...p))),20,radius,8,false),color)
}
function clover(b:PropBuilder,x:number,y:number,z:number,r:number,color=gold){
 for(const [dx,dy]of [[-1,0],[1,0],[0,-1],[0,1]])roundShopVolume(b,'paint',color,[x+dx!*r*.65,y+dy!*r*.65,z],[r*.7,r*.7,.035])
}
/** Facial pieces follow the convex front instead of floating above a flat facade. */
function faceDepth(f:RecreationFacility,x:number,y:number){
 const across=Math.sqrt(Math.max(0,1-(x/(f.width/2+.3))**2))
 const vertical=Math.sqrt(Math.max(0,1-((y-f.height*.46)/(f.height*.9))**2))
 return (f.depth-1.5)/2+.4+1.35*across*vertical
}
function softVolume(b:PropBuilder,color:string,p:XYZ,s:XYZ){
 // BufferGeometry retains these segments in the simplified park builder.
 const source=new SphereGeometry(1,40,28),g=new BufferGeometry().copy(source)
 source.dispose();b.add('paint',g,color,p,s)
}

/** A shared grid bends continuously from the open mouth to the rounded outer silhouette. */
export function moleBodyGeometry(f:RecreationFacility){
 const vertices:number[]=[],indices:number[]=[],around=128,rings=32,stride=rings+1
 for(const side of [1,-1])for(let i=0;i<=around;i++){
  const angle=Math.PI*i/around,sin=Math.sin(angle),cos=Math.cos(angle)
  for(let j=0;j<=rings;j++){
   const t=j/rings,x=(f.doorWidth/2+(f.width-f.doorWidth)/2*t)*cos
   const y=.14+(3.9-.14)*sin**.52*(1-t)+(f.height-.14)*sin**.72*t
   const depth=(faceDepth(f,x,y)-.9*(1-y/f.height)**2)*Math.sqrt(Math.max(0,1-t**6))
   vertices.push(x,y,side*depth)
  }
 }
 const sheet=(around+1)*stride
 for(let side=0;side<2;side++)for(let i=0;i<around;i++)for(let j=0;j<rings;j++){
  const k=side*sheet+i*stride+j
  if(side===0)indices.push(k,k+1,k+stride,k+1,k+stride+1,k+stride)
  else indices.push(k,k+stride,k+1,k+1,k+stride,k+stride+1)
 }
 // Close the arched tunnel and ground edges; the outer boundary is shared at Z0.
 for(let i=0;i<around;i++){const a=i*stride,b=a+stride;indices.push(a,b,a+sheet,b,b+sheet,a+sheet)}
 for(const i of [0,around])for(let j=0;j<rings;j++){
  const a=i*stride+j,b=a+1
  if(i===0)indices.push(a,a+sheet,b,b,a+sheet,b+sheet)
  else indices.push(a,b,a+sheet,b,b+sheet,a+sheet)
 }
 const source=new BufferGeometry();source.setAttribute('position',new Float32BufferAttribute(vertices,3));source.setIndex(indices)
 const geometry=mergeVertices(source,1e-5);source.dispose();geometry.computeVertexNormals();return geometry
}

/** Curved, overlapping tile ribs sit on a continuous roof skin, so the eaves have no gaps. */
function tiledCap(b:PropBuilder,cx:number,cz:number,half:number,depth:number,base:number,rise:number,seat?:(x:number,z:number)=>number){
 const y=(x:number,z:number)=>{
  const t=Math.min(1,Math.abs(x-cx)/half),hip=Math.max(0,Math.min(1,(depth/2-Math.abs(z-cz))/(depth*.3)))
  return (seat?seat(x,z)+.12:base)+rise*Math.cos(t*Math.PI/2)**1.15*(seat?1:hip*hip*(3-2*hip))+.2*(Math.max(0,t-.78)/.22)**2
 }
 if(!seat)b.box('wood',timber,[cx,base-.13,cz],[half*2,.26,depth])
 const nx=32,nz=20,vertices:number[]=[],indices:number[]=[]
 for(let ix=0;ix<=nx;ix++)for(let iz=0;iz<=nz;iz++){
  const x=cx-half+2*half*ix/nx,z=cz-depth/2+depth*iz/nz
  vertices.push(x,y(x,z),z)
 }
 for(let ix=0;ix<nx;ix++)for(let iz=0;iz<nz;iz++){
  const k=ix*(nz+1)+iz;indices.push(k,k+1,k+nz+1,k+1,k+nz+2,k+nz+1)
 }
 const skin=new BufferGeometry();skin.setAttribute('position',new Float32BufferAttribute(vertices,3));skin.setIndex(indices);skin.computeVertexNormals();b.add('tile',skin,tile)
 if(seat){
  const points:number[]=[],triangles:number[]=[],sheet=(nx+1)*(nz+1)
  for(const offset of [.08,-.12])for(let ix=0;ix<=nx;ix++)for(let iz=0;iz<=nz;iz++){
   const x=cx-half+2*half*ix/nx,z=cz-depth/2+depth*iz/nz;points.push(x,seat(x,z)+offset,z)
  }
  for(let i=0;i<indices.length;i+=3){const a=indices[i]!,c=indices[i+1]!,d=indices[i+2]!;triangles.push(a,c,d,a+sheet,d+sheet,c+sheet)}
  const edge=(a:number,c:number)=>triangles.push(a,a+sheet,c,c,a+sheet,c+sheet)
  for(let ix=0;ix<nx;ix++){edge(ix*(nz+1),(ix+1)*(nz+1));edge((ix+1)*(nz+1)+nz,ix*(nz+1)+nz)}
  for(let iz=0;iz<nz;iz++){edge(iz+1,iz);edge(nx*(nz+1)+iz,nx*(nz+1)+iz+1)}
  const bedding=new BufferGeometry();bedding.setAttribute('position',new Float32BufferAttribute(points,3));bedding.setIndex(triangles);bedding.computeVertexNormals();b.add('wood',bedding,timber)
 }
 for(const side of [-1,1]){
  const columns=seat?-1:Math.ceil(depth*.4/.42)
  for(let j=0;j<=columns;j++){
   const z=cz-depth*.2+j*depth*.4/columns
   line(b,tile,Array.from({length:17},(_,i)=>{const x=cx+side*half*i/16;return [x,y(x,z)+.035,z]}),.16)
   b.add('paint',new CylinderGeometry(.17,.17,.14,24),'#edc894',[cx+side*half,y(cx+side*half,z)-.02,z],[1,1,1],[0,0,Math.PI/2])
  }
  const courses=Math.ceil(half*2/.43)
  for(let j=0;j<=courses;j++){
   const x=cx-half+j*half*2/courses
   if(!seat||side===1)line(b,tile,Array.from({length:15},(_,i)=>{const z=cz+side*depth*(seat?(-.5+i/14):(.18+.32*i/14));return [x,y(x,z)+.035,z]}),.16)
   b.add('paint',new CylinderGeometry(.17,.17,.14,24),'#edc894',[x,y(x,cz+side*depth/2)-.02,cz+side*depth/2],[1,1,1],[Math.PI/2,0,0])
  }
  const z=cz+side*depth/2
  line(b,timber,Array.from({length:33},(_,i)=>{const x=cx-half+2*half*i/32;return [x,y(x,z)-.13,z+side*.03]}),.17)
  line(b,'#bd8d55',Array.from({length:33},(_,i)=>{const x=cx-half+2*half*i/32;return [x,y(x,z)-.06,z+side*.16]}),.045)
  if(seat){
   const panel=new Shape()
   for(let i=0;i<=32;i++){const x=cx-half+2*half*i/32;i?panel.lineTo(x,y(x,z)-.12):panel.moveTo(x,y(x,z)-.12)}
   for(let i=32;i>=0;i--){const x=cx-half+2*half*i/32;panel.lineTo(x,seat(x,z)+.025)}
   panel.closePath();b.add('wood',new ExtrudeGeometry(panel,{depth:.16,bevelEnabled:true,bevelSize:.025,bevelThickness:.025,bevelSegments:3}),'#b3844f',[0,0,z-.08])
  }
 }
 if(seat){
  line(b,tile,Array.from({length:25},(_,i)=>{const z=cz-depth/2+depth*i/24;return [cx,y(cx,z)+.08,z]}),.25)
  b.add('tile',new CylinderGeometry(.25,.25,.12,28),'#625a56',[cx,y(cx,cz+depth/2)+.08,cz+depth/2+.07],[1,1,1],[Math.PI/2,0,0])
 }else b.add('tile',new CylinderGeometry(.25,.25,depth*.42,28),tile,[cx,y(cx,cz)+.08,cz],[1,1,1],[Math.PI/2,0,0])
}
function addSideArt(target:PropBuilder,local:PropBuilder,origin:XYZ,yaw:number){
 const matrix=new Matrix4().makeRotationY(yaw);matrix.setPosition(...origin)
 for(const [kind,g]of Object.entries(local.finish())){
  // Local batches are indexed; preview builders collect non-indexed parts before welding.
  const part=SIMPLE_MAP&&g.index?g.toNonIndexed():g
  if(part!==g)g.dispose()
  part.applyMatrix4(matrix);target.parts[kind as PropFinish].push(part)
 }
}
function lantern(b:PropBuilder,p:XYZ,scale:number,anchor:XYZ){
 const at=(x:number,y:number,z:number):XYZ=>[p[0]+x*scale,p[1]+y*scale,p[2]+z*scale]
 b.box('glow','#ffcb65',at(0,0,0),[.44*scale,.6*scale,.35*scale])
 for(const side of [-1,1])for(const z of [-.2,.2])b.box('wood',timber,at(side*.25,0,z),[.065*scale,.73*scale,.065*scale])
 for(const y of [-.36,0,.36])b.box('wood',timber,at(0,y,.22),[.56*scale,.065*scale,.075*scale])
 b.box('wood',timber,at(0,0,.22),[.055*scale,.7*scale,.075*scale])
 b.box('wood',timber,at(0,.4,0),[.68*scale,.13*scale,.52*scale]);b.box('wood',timber,at(0,-.4,0),[.62*scale,.12*scale,.46*scale])
 // A continuous bracket overlaps the cap and penetrates the wall/eave anchor.
 line(b,dark,[at(0,.36,0),[p[0],anchor[1],p[2]],anchor],.045*scale)
 b.box('wood',timber,anchor,[.18*scale,.22*scale,.18*scale])
}
export function buildMoleDemoHead(){
 const b=new PropBuilder()
 // The reference is a single rounded body with a continuous neck, tiny eyes and a pink nose.
 const profile:[number,number][]=[[0,-.62],[.22,-.62],[.252,-.58],[.263,-.48],[.263,-.15],[.255,.08]]
 for(let i=1;i<=20;i++){const angle=i*Math.PI/40;profile.push([.255*Math.cos(angle),.08+.28*Math.sin(angle)])}
 b.add('paint',new LatheGeometry(profile.map(([r,y])=>new Vector2(r,y)),48),'#ae806a')
 for(const side of [-1,1]){
  softVolume(b,'#211e1c',[side*.079,.167,.242],[.027,.046,.022])
  softVolume(b,'#fff9ec',[side*.079-.006,.185,.26],[.008,.011,.007])
 }
 softVolume(b,'#e6a3c0',[0,.015,.278],[.118,.069,.047])
 softVolume(b,'#f8d3e5',[-.025,.039,.316],[.043,.02,.01])
 return b.finish()
}
export function buildMoleDemoHammer(){
 const b=new PropBuilder()
 b.cylinder('wood','#b87a37',[0,DEMO.hammerLength/2,0],.065,DEMO.handleRadius,DEMO.hammerLength+DEMO.handleOverhang*2)
 b.cylinder('wood','#aa6d30',[0,DEMO.hammerLength-.1,0],.105,.105,.24)
 b.cylinder('paint','#bd6342',[0,DEMO.hammerLength,0],DEMO.hammerRadius,DEMO.hammerRadius,.78,[0,0,Math.PI/2],24)
 for(const x of [-.32,.32])b.cylinder('paint',gold,[x,DEMO.hammerLength,0],DEMO.hammerRadius,DEMO.hammerRadius,.12,[0,0,Math.PI/2],24)
 return b.finish()
}
function gameCounter(b:PropBuilder,f:RecreationFacility){
 const machines=recreationMachines(f),counterZ=machines[0]!.z
 for(const m of machines){
  b.box('wood',timber,[m.x,.68,m.z],[m.width,1.06,m.depth])
  for(let n=0;n<5;n++)b.box('wood',n%2?'#b5763d':'#a26834',[m.x+(n-2)*.35,.7,m.z+m.depth/2+.025],[.32,.98,.065])
  for(const dz of [-.4,.4]){
   b.cylinder('paint','#553b26',[m.x,1.2,m.z+dz],.32,.32,.04)
   b.add('wood',new TorusGeometry(.34,.035,6,24),'#ac723b',[m.x,1.42,m.z+dz],[1,1,1],[Math.PI/2,0,0])
  }
 }
 // A single four-hole top and overlapping center plank close the former two-table seam.
 const s=new Shape();s.moveTo(-2.07,-.84);s.lineTo(2.07,-.84);s.lineTo(2.07,.84);s.lineTo(-2.07,.84);s.closePath()
 for(const m of machines)for(const dz of [-.4,.4]){const hole=new Path();hole.absellipse(m.x,dz,.34,.34,0,Math.PI*2,true);s.holes.push(hole)}
 const top=new ExtrudeGeometry(s,{depth:.12,bevelEnabled:true,bevelSize:.045,bevelThickness:.035,bevelSegments:2,curveSegments:20});top.rotateX(-Math.PI/2)
 b.add('paint',top,'#ecc56c',[0,1.25,counterZ])
 b.box('wood',timber,[0,.68,counterZ],[.24,1.06,1.6])
 b.box('wood','#a26834',[0,.7,counterZ+.825],[.24,.98,.065])
 for(const y of [.2,1.17])b.box('wood','#a1642e',[0,y,counterZ+.86],[4.22,.15,.22])
 for(const x of [-1.35,0,1.35])clover(b,x,.67,counterZ+.91,.2)
}

export function drawMoleShopSign(c:CanvasRenderingContext2D,w:number,h:number){
 c.fillStyle='#80532e';c.fillRect(0,0,w,h);c.fillStyle=cream;c.textAlign='center';c.textBaseline='middle';c.font=`800 ${h*.6}px "Malgun Gothic",sans-serif`;c.fillText('두더지 잡기',w/2,h/2,w*.93)
}
export function buildMoleShop(f:RecreationFacility){
 const b=new PropBuilder(),roof=new PropBuilder(),walls=new PropBuilder(),cutWalls=new PropBuilder(),front=f.depth/2
 b.box('stone','#cbb697',[0,.07,0],[f.width,.14,f.depth])
 const shell=moleBodyGeometry(f),surfaceMaterial=new MeshBasicMaterial(),surface=new Mesh(shell,surfaceMaterial),ray=new Raycaster()
 surface.updateMatrixWorld()
 const depthCache=new Map<string,number>()
 const mount=(x:number,y:number)=>{
  const key=x.toFixed(6)+':'+y.toFixed(6),cached=depthCache.get(key)
  if(cached!==undefined)return cached
  ray.set(new Vector3(x,y,12),new Vector3(0,0,-1))
  const depth=ray.intersectObject(surface)[0]?.point.z??faceDepth(f,x,y)
  depthCache.set(key,depth);return depth
 }
 const clearance=(x:number,y:number,rx:number,ry:number)=>{
  let z=-Infinity
  for(let ix=-2;ix<=2;ix++)for(let iy=-2;iy<=2;iy++)z=Math.max(z,mount(x+ix*rx/2,y+iy*ry/2))
  return z
 }
 const cheek=(x:number,y:number)=>{
  const g=new SphereGeometry(1,40,24),points=g.getAttribute('position')
  for(let i=0;i<points.count;i++){
   const px=x+points.getX(i)*.55,py=y+points.getY(i)*.25
   points.setXYZ(i,px,py,mount(px,py)+.17+points.getZ(i)*.14)
  }
  g.computeVertexNormals();const copy=new BufferGeometry().copy(g);g.dispose();walls.add('paint',copy,'#dc907b')
 }
 const faceOval=(color:string,x:number,y:number,rx:number,ry:number,depth:number)=>{
  const source=new SphereGeometry(1,40,24),positions=source.getAttribute('position')
  for(let i=0;i<positions.count;i++){
   const px=x+positions.getX(i)*rx,py=y+positions.getY(i)*ry
   positions.setXYZ(i,px,py,mount(px,py)+depth+.02+positions.getZ(i)*depth)
  }
  source.computeVertexNormals();const g=new BufferGeometry().copy(source);source.dispose();walls.add('paint',g,color)
 }
 walls.add('paint',shell,soil)
 for(const side of [-1,1]){
  softVolume(b,'#bd865f',[side*3.75,1.02,3.08],[1.23,1.2,1.24])
  const clawProfile:[[number,number],...[number,number][]]=[[0,0],[.065,.04],[.14,.16],[.25,.42],[.31,.75],[.3,1.02],[.22,1.22],[.1,1.34],[0,1.37]]
  for(const dx of [-.63,0,.63])b.add('paint',new LatheGeometry(clawProfile.map(([r,y])=>new Vector2(r,y)),32),cream,[side*3.75+dx,.12,4.48],[1,1,1],[-.25,0,0])
  const eyeX=side*1.1,eyeY=5.1
  faceOval('#211e1c',eyeX,eyeY,.22,.32,.08)
  const glintX=eyeX-.055,glintY=eyeY+.105
  softVolume(walls,'#fff9ec',[glintX,glintY,mount(glintX,glintY)+.17],[.055,.07,.022])
  cheek(side*3.3,4.25)
  lantern(walls,[side*2.6,2.65,clearance(side*2.6,2.65,.29,.4)+.32],.84,[side*2.6,3.35,mount(2.6,3.35)-.06])
  cutWalls.box('wood',timber,[side*4.75,.65,0],[.4,1.3,f.depth])
 }
 faceOval('#e6a3c0',0,4.63,.68,.38,.23)
 softVolume(walls,'#f8d3e5',[-.16,4.76,mount(-.16,4.76)+.45],[.19,.085,.025])
 // Windows and their eaves face outward on the true left/right side walls.
 const sideZ=.8
 for(const side of [-1,1]){
  let edge=0
  for(const y of [2.05,2.65,3.25])for(const z of [sideZ-.65,sideZ,sideZ+.65]){
   ray.set(new Vector3(side*12,y,z),new Vector3(-side,0,0));const hit=ray.intersectObject(surface)[0]
   if(hit)edge=Math.max(edge,Math.abs(hit.point.x))
  }
  const window=new PropBuilder(),hood=new PropBuilder(),origin:XYZ=[side*(edge+.06),0,sideZ]
  window.add('wood',new CylinderGeometry(.73,.73,.6,40),timber,[0,2.65,-.31],[1,1,1],[Math.PI/2,0,0])
  window.add('glow',new CylinderGeometry(.62,.62,.07,32),'#ffcc6c',[0,2.65,.03],[1,1,1],[Math.PI/2,0,0])
  window.add('wood',new TorusGeometry(.66,.1,12,40),timber,[0,2.65,.1])
  for(const dx of [-.26,0,.26])window.box('wood',timber,[dx,2.65,.16],[.065,dx===0?1.15:1.02,.07])
  for(const dy of [-.28,.28])window.box('wood',timber,[0,2.65+dy,.16],[1.02,.065,.07])
  tiledCap(hood,0,.23,1.05,1.65,3.55,.5)
  for(const x of [-.72,.72])hood.box('wood',timber,[x,3.22,-.1],[.15,.44,.75])
  addSideArt(walls,window,origin,side*Math.PI/2);addSideArt(roof,hood,origin,side*Math.PI/2)
 }
 // The reference contributes only the varied, gray stone ring around the base.
 for(const [i,r]of moleShopRocks(f).entries()){
  const stone=new IcosahedronGeometry(1,1),points=stone.getAttribute('position')
  for(let v=0;v<points.count;v++){
   const x=points.getX(v),y=points.getY(v),z=points.getZ(v)
   const wobble=1+.09*Math.sin(x*5+z*3+i*1.8)+.05*Math.cos(y*6-x*3+i)
   points.setXYZ(v,x*wobble,Math.max(-.5,y*wobble),z*wobble)
  }
  stone.computeVertexNormals()
  b.add('stone',stone,['#969c96','#848b87','#acafa3','#747d79'][i%4]!,[r.x,r.ry*.5,r.z],[r.rx,r.ry,r.rz],[0,r.yaw,0])
 }
 b.cylinder('wood',dark,[0,3.34,front-.45],.075,.075,4.0,[0,0,Math.PI/2],20)
 for(const x of [-1.25,0,1.25]){
  walls.box('paint',cream,[x,3.12,front-.4],[1.2,.48,.06]);clover(walls,x,3.12,front-.35,.14,'#bb7a36')
 }
 // Rear wood backing and the four-hole counter sit behind a walkable mouth entrance.
 for(let i=0;i<10;i++)b.box('wood',i%2?timber:'#a5713e',[(i-4.5)*.43,1.7,-3.13],[.41,3.12,.12])
 cutWalls.box('paint',earth,[0,.65,-front],[f.width,1.3,.3]);gameCounter(b,f)
 surfaceMaterial.dispose()
 return {body:b.finish(),roof:roof.finish(),walls:walls.finish(),cutWalls:cutWalls.finish(),draw:drawMoleShopSign}
}
