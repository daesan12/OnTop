import {BufferGeometry,CatmullRomCurve3,CylinderGeometry,Float32BufferAttribute,TubeGeometry,Vector3} from 'three'
import {type PropBuilder,type XYZ} from '../../../../../../../../src/world/art/propGeometry.ts'

const tile='#53515c',timber='#93633d',end='#e2c397'
function roll(b:PropBuilder,finish:'tile'|'wood',color:string,points:XYZ[],radius:number){
 b.add(finish,new TubeGeometry(new CatmullRomCurve3(points.map(p=>new Vector3(...p))),32,radius,12,false),color)
}

/** Curved roof skin plus overlapping round rolls; all geometry is built once. */
export function addArcadeTileRoof(b:PropBuilder,f:{width:number;depth:number;height:number}){
 const hx=f.width/2+.8,hz=f.depth/2+.8,ridge=(f.width-f.depth)/2,base=f.height-.35,rise=3.35
 const height=(x:number,z:number)=>{
  const t=Math.min(1,Math.max(Math.abs(z)/hz,Math.max(0,(Math.abs(x)-ridge)/(hx-ridge))))
  const curl=Math.max(0,(t-.65)/.35),smoothCurl=curl*curl*(3-2*curl)
  const corner=.72*(Math.abs(x)/hx)**6*(Math.abs(z)/hz)**6
  return base+rise*(1-t)**1.65+.65*smoothCurl+corner
 }
 const nx=64,nz=48,positions:number[]=[],indices:number[]=[]
 for(let ix=0;ix<=nx;ix++)for(let iz=0;iz<=nz;iz++){
  const x=-hx+2*hx*ix/nx,z=-hz+2*hz*iz/nz;positions.push(x,height(x,z),z)
 }
 for(let ix=0;ix<nx;ix++)for(let iz=0;iz<nz;iz++){
  const k=ix*(nz+1)+iz;indices.push(k,k+1,k+nz+1,k+1,k+nz+2,k+nz+1)
 }
 const skin=new BufferGeometry();skin.setAttribute('position',new Float32BufferAttribute(positions,3));skin.setIndex(indices);skin.computeVertexNormals();b.add('tile',skin,tile)
 const underside=new BufferGeometry();underside.setAttribute('position',new Float32BufferAttribute(positions.map((v,i)=>i%3===1?v-.22:v),3));
 const reversed:number[]=[];for(let i=0;i<indices.length;i+=3)reversed.push(indices[i]!,indices[i+2]!,indices[i+1]!);underside.setIndex(reversed);underside.computeVertexNormals();b.add('wood',underside,timber)
 for(const side of [-1,1]){
  const count=Math.ceil(hx*2/.65)
  for(let i=0;i<=count;i++){
   const x=-hx+hx*2*i/count,start=Math.max(-ridge,Math.min(ridge,x))
   roll(b,'tile',i%3===0?'#5c5964':tile,Array.from({length:21},(_,j)=>{const t=j/20,px=start+(x-start)*t,z=side*hz*t;return [px,height(px,z)+.05,z]}),.215)
   b.add('paint',new CylinderGeometry(.235,.235,.18,28),end,[x,height(x,side*hz)+.03,side*(hz+.025)],[1,1,1],[Math.PI/2,0,0])
  }
  for(let z=-hz+.34;z<hz;z+=.65){
   roll(b,'tile',tile,Array.from({length:21},(_,j)=>{const t=j/20,x=side*(ridge+(hx-ridge)*t),pz=z*t;return [x,height(x,pz)+.05,pz]}),.215)
   b.add('paint',new CylinderGeometry(.235,.235,.18,28),end,[side*(hx+.025),height(side*hx,z)+.03,z],[1,1,1],[0,0,Math.PI/2])
  }
  roll(b,'wood',timber,Array.from({length:33},(_,i)=>{const x=-hx+2*hx*i/32;return [x,height(x,side*hz)-.18,side*hz]}),.2)
  roll(b,'wood','#bd8e55',Array.from({length:33},(_,i)=>{const x=-hx+2*hx*i/32;return [x,height(x,side*hz)-.06,side*(hz+.12)]}),.055)
  roll(b,'wood',timber,Array.from({length:25},(_,i)=>{const z=-hz+2*hz*i/24;return [side*hx,height(side*hx,z)-.18,z]}),.2)
 }
 roll(b,'tile','#55505a',Array.from({length:25},(_,i)=>{const x=-ridge+2*ridge*i/24;return [x,base+rise+.15+.24*(Math.abs(x)/ridge)**6,0]}),.3)
 for(const side of [-1,1]){
  b.add('tile',new CylinderGeometry(.46,.46,.36,32),'#625c65',[side*(ridge+.07),base+rise+.4,0],[1,1,1],[0,0,Math.PI/2])
 }
 b.box('paint','#eee2ca',[0,f.height-.03,0],[f.width,.14,f.depth])
 for(const x of [-f.width/4,f.width/4])b.box('wood',timber,[x,f.height-.16,0],[.18,.24,f.depth])
}
