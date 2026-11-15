import {BufferGeometry,CatmullRomCurve3,CylinderGeometry,Euler,Float32BufferAttribute,LatheGeometry,Quaternion,SphereGeometry,TubeGeometry,Vector2,Vector3} from 'three'
import {type PropBuilder,type XYZ} from '../../../../../src/world/art/propGeometry.ts'

const tile='#55535f',wood='#a87437',hx=2.12,hz=1.72,ridge=.48
export const GACHA_EAVES=4.62
function height(x:number,z:number){
 const t=Math.min(1,Math.max(Math.abs(z)/hz,Math.max(0,(Math.abs(x)-ridge)/(hx-ridge))))
 const curl=Math.max(0,(t-.67)/.33)
 const cx=Math.max(0,(Math.abs(x)/hx-.55)/.45),cz=Math.max(0,(Math.abs(z)/hz-.55)/.45)
 return GACHA_EAVES+.98*(1-t)**1.55+.18*curl*curl*(3-2*curl)+.11*cx*cx*(3-2*cx)*cz*cz*(3-2*cz)
}
function surface(b:PropBuilder,positions:number[],indices:number[],kind:'tile'|'wood',color:string){
 const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();b.add(kind,g,color)
}
function rib(b:PropBuilder,points:XYZ[],radius:number){
 const curve=new CatmullRomCurve3(points.map(p=>new Vector3(...p)))
 const cuts=[0,.27,.51,.75,1]
 for(let i=0;i<4;i++){
  const start=Math.max(0,cuts[i]!-.014),end=Math.min(1,cuts[i+1]!+.006)
  const section=new CatmullRomCurve3(Array.from({length:9},(_,j)=>curve.getPoint(start+(end-start)*j/8)))
  const g=new TubeGeometry(section,6,radius,10,false),p=g.getAttribute('position')
  for(let row=0;row<=6;row++){
   const centre=section.getPointAt(row/6),taper=.95+.12*row/6
   for(let v=0;v<=10;v++){const k=row*11+v;p.setXYZ(k,centre.x+(p.getX(k)-centre.x)*taper,centre.y+(p.getY(k)-centre.y)*taper,centre.z+(p.getZ(k)-centre.z)*taper)}
  }
  g.computeVertexNormals();b.add('tile',g,i%2?'#62606d':'#5b5965')
 }
 const direction=curve.getTangent(1).normalize(),tip=curve.getPoint(1),end=tip.clone().addScaledVector(direction,.06),r=new Euler().setFromQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0,1,0),direction))
 b.add('tile',new CylinderGeometry(radius,radius,.065,16),'#62606d',tip.clone().addScaledVector(direction,.025).toArray() as XYZ,[1,1,1],r.toArray().slice(0,3) as XYZ)
 const cap=new LatheGeometry([[0,-.025],[radius*.82,-.025],[radius*.98,-.014],[radius*.98,.01],[radius*.83,.026],[0,.026]].map(p=>new Vector2(...p)),20)
 b.add('tile',cap,'#817d88',end.toArray() as XYZ,[1,1,1],r.toArray().slice(0,3) as XYZ)
}
/** Wide concave pan tiles, small convex cover tiles, scalloped eaves and a full hip roof. */
export function addGachaRoof(b:PropBuilder){
 const positions:number[]=[],indices:number[]=[],nx=24,nz=20
 for(let ix=0;ix<=nx;ix++)for(let iz=0;iz<=nz;iz++){const x=-hx+hx*2*ix/nx,z=-hz+hz*2*iz/nz;positions.push(x,height(x,z)-.075,z)}
 for(let ix=0;ix<nx;ix++)for(let iz=0;iz<nz;iz++){const k=ix*(nz+1)+iz;indices.push(k,k+1,k+nz+1,k+1,k+nz+2,k+nz+1)}
 surface(b,positions,indices,'tile',tile)
 const reverse:number[]=[];for(let i=0;i<indices.length;i+=3)reverse.push(indices[i]!,indices[i+2]!,indices[i+1]!)
 surface(b,positions.map((v,i)=>i%3===1?v-.1:v),reverse,'wood',wood)
 // In each pan, the centre sits below both edges: an actual ceramic trough cross-section.
 const pan=(edge:number,spacing:number,side:number,front:boolean)=>{
  const nu=6,start=front?Math.max(-ridge,Math.min(ridge,edge)):side*ridge
  const point=(t:number,u:number):XYZ=>{
   const taper=front&&Math.abs(edge)<=ridge?1:Math.max(.01,t),spread=spacing*.5*taper,across=u*spread
   const x=front?start+(edge-start)*t+across:side*(ridge+(hx-ridge)*t),z=front?side*hz*t:edge*t+across
   return [x,height(x,z)-.028+.065*u*u,z]
  }
  const cuts=[0,.27,.51,.75,1]
  for(let section=0;section<4;section++){
   const p:number[]=[],idx:number[]=[],nt=4,from=Math.max(0,cuts[section]!-.016),to=Math.min(1,cuts[section+1]!+.008)
   for(let it=0;it<=nt;it++)for(let iu=0;iu<=nu;iu++){
    const progress=it/nt,v=point(from+(to-from)*progress,iu/nu*2-1);v[1]+=.018*progress*progress;p.push(...v)
   }
   for(let it=0;it<nt;it++)for(let iu=0;iu<nu;iu++){
    const k=it*(nu+1)+iu,a=[k,k+1,k+nu+1,k+1,k+nu+2,k+nu+1],facingUp=front?side===-1:side===1
    idx.push(...(facingUp?a:[a[0]!,a[2]!,a[1]!,a[3]!,a[5]!,a[4]!]))
   }
   surface(b,p,idx,'tile',section%2?'#5b5965':tile)
   if(section<3){
    const joint=Array.from({length:9},(_,i)=>{const v=point(to,i/4-1);v[1]+=.018;return new Vector3(...v)})
    b.add('tile',new TubeGeometry(new CatmullRomCurve3(joint),8,.01,5,false),'#797582')
   }
  }
  // Thin solid ceramic lip, rather than a thick U-shaped cord across the eave.
  const lip:number[]=[],faces:number[]=[]
  for(let i=0;i<=12;i++){
   const v=point(1,i/6-1);v[1]+=.018;if(front)v[2]+=side*.035;else v[0]+=side*.035
   lip.push(...v,v[0],v[1]-.04,v[2])
  }
  for(let i=0;i<12;i++){const k=i*2,a=[k,k+1,k+2,k+1,k+3,k+2],outward=front?side===1:side===-1;faces.push(...(outward?a:[a[0]!,a[2]!,a[1]!,a[3]!,a[5]!,a[4]!]))}
  surface(b,lip,faces,'tile','#77717e')
 }
 for(const side of [-1,1]){
  const n=10,spacing=hx*2/n
  for(let i=0;i<n;i++)pan(-hx+(i+.5)*spacing,spacing,side,true)
  for(let i=0;i<=n;i++){
   const x=-hx+i*spacing,start=Math.max(-ridge,Math.min(ridge,x))
   rib(b,Array.from({length:25},(_,j):XYZ=>{const t=j/24,px=start+(x-start)*t,z=side*hz*t;return [px,height(px,z)+.055,z]}),i===0||i===n?.105:.075)
  }
  const ns=8,step=hz*2/ns
  for(let i=0;i<ns;i++)pan(-hz+(i+.5)*step,step,side,false)
  for(let i=1;i<ns;i++){
   const z=-hz+i*step;rib(b,Array.from({length:25},(_,j):XYZ=>{const t=j/24,x=side*(ridge+(hx-ridge)*t),pz=z*t;return [x,height(x,pz)+.055,pz]}),.075)
  }
 }
 // A continuous closed timber fascia closes the lifted corners and the underside.
 const perimeter:Vector3[]=[]
 for(let side=0;side<4;side++)for(let i=0;i<24;i++){
  const t=i/24,x=side===0?hx-2*hx*t:side===1?-hx:side===2?-hx+2*hx*t:hx,z=side===0?hz:side===1?hz-2*hz*t:side===2?-hz:-hz+2*hz*t
  perimeter.push(new Vector3(x,height(x,z)-.1,z))
 }
 b.add('wood',new TubeGeometry(new CatmullRomCurve3(perimeter,true,'centripetal'),128,.09,10,true),wood)
 b.box('wood','#b7803e',[0,4.48,0],[3.5,.18,2.8])
 // Visible rafters and small corbels replace the broad flat plank below the roof.
 for(const x of [-1.35,-.9,-.45,0,.45,.9,1.35])b.box('wood','#c2914e',[x,4.44,1.33],[.13,.23,.36])
 for(const x of [-1.48,1.48])b.box('wood','#a56a31',[x,4.38,1.05],[.18,.34,.38])
 const top=new CatmullRomCurve3([[-.9,5.77,0],[-.48,5.68,0],[0,5.68,0],[.48,5.68,0],[.9,5.77,0]].map(p=>new Vector3(...p)))
 b.add('tile',new TubeGeometry(top,24,.135,12,false),'#65606d')
 for(const x of [-.9,.9])b.add('gold',new SphereGeometry(.13,16,12),'#e6b853',[x,5.77,0])
}
