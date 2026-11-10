import {BufferGeometry,Float32BufferAttribute} from 'three'
import {parkGround} from './groundGeometry.ts'
import {groundSurfaceHeight} from './groundSurface.ts'
import {insidePark,inLake,heightAt,site,STATION_STEPS,FISHING_ACCESS,ENTRANCE_PATHS,onSquareEndedPath} from './plan.ts'
import {onLand,isPlantingGround,FLOOR_Y_OFFSET} from './groundPlan.ts'
import {inSummit} from './hybridTerrainPlan.ts'
type V=readonly[number,number,number]
const boundary=(indices:number[])=>{const m=new Map<string,{a:number;b:number;n:number}>();for(let i=0;i<indices.length;i+=3)for(let j=0;j<3;j++){const a=indices[i+j]!,b=indices[i+(j+1)%3]!;if(a===b)continue;const k=Math.min(a,b)+':'+Math.max(a,b),e=m.get(k);if(e)e.n++;else m.set(k,{a,b,n:1})}return m}
const g=parkGround,paving=boundary(Array.from(g.paving.getIndex()!.array)),position=g.paving.getAttribute('position')
const adjacency=new Map<number,number[]>(),unused=new Set<string>(),key=(a:number,b:number)=>Math.min(a,b)+':'+Math.max(a,b)
const welded=new Map<string,number>(),weld=(i:number)=>{const k=[position.getX(i),position.getY(i),position.getZ(i)].map(v=>v.toFixed(3)).join(','),old=welded.get(k);if(old!==undefined)return old;welded.set(k,i);return i},selected:{a:number;b:number}[]=[]
// Classify the real grass verge rather than requiring independently clipped
// grass/paving triangles to have identical indices. Weld sub-millimetre joins.
for(const e of paving.values()){if(e.n!==1)continue;const x=(position.getX(e.a)+position.getX(e.b))/2,z=(position.getZ(e.a)+position.getZ(e.b))/2,y=(position.getY(e.a)+position.getY(e.b))/2,dx=position.getX(e.b)-position.getX(e.a),dz=position.getZ(e.b)-position.getZ(e.a),length=Math.hypot(dx,dz);if(length<.0001||!insidePark(x,z,1)||inLake(x,z,.3))continue
 if(ENTRANCE_PATHS.some(p=>Math.hypot(x-p.b[0],z-p.b[1])<p.width/2+.15))continue
 const stage=site('balloon');if(Math.abs(x-stage.x)<STATION_STEPS.halfX+.45&&z-stage.z>STATION_STEPS.z0-.45&&z-stage.z<STATION_STEPS.z1+.45||onSquareEndedPath(x,z,FISHING_ACCESS.points[0]!,FISHING_ACCESS.points[1]!,FISHING_ACCESS.width+.65,.3))continue
 if(![-1,1].some(side=>{const px=x-dz/length*.08*side,pz=z+dx/length*.08*side;return onLand(px,pz)&&isPlantingGround(px,pz)&&Math.abs(heightAt(px,pz)+FLOOR_Y_OFFSET-y)<.25}))continue
 const a=weld(e.a),b=weld(e.b),k=key(a,b);if(a===b||unused.has(k))continue;unused.add(k);selected.push({a,b});for(const[u,v]of[[a,b],[b,a]]){const list=adjacency.get(u!)??[];list.push(v!);adjacency.set(u!,list)}
}
const point=(id:number):V=>[position.getX(id),position.getY(id),position.getZ(id)]
const raw:V[][]=[]
const trace=(start:number,next:number)=>{const ids=[start];let a=start,b=next;while(unused.has(key(a,b))){unused.delete(key(a,b));ids.push(b);const c=adjacency.get(b)?.find(c=>unused.has(key(b,c)));if(c===undefined)break;a=b;b=c;if(ids.length>30000)throw new Error('curb boundary loop')}return ids.map(point)}
for(const[a,links]of adjacency)if(links.length!==2)for(const b of links)if(unused.has(key(a,b)))raw.push(trace(a,b))
for(const e of selected)if(unused.has(key(e.a,e.b)))raw.push(trace(e.a,e.b))
/** Remove near-collinear micro-fragments while retaining the true corners and grade changes. */
function simplify(p:V[]):V[]{if(p.length<3)return p;const out:V[]=[p[0]!];for(let i=1;i<p.length-1;i++){const a=out.at(-1)!,b=p[i]!,c=p[i+1]!,dx=c[0]-a[0],dz=c[2]-a[2],l=Math.hypot(dx,dz),t=l?((b[0]-a[0])*dx+(b[2]-a[2])*dz)/(l*l):0,error=l?Math.abs(dx*(a[2]-b[2])-(a[0]-b[0])*dz)/l:1,gradeError=Math.abs(b[1]-a[1]-(c[1]-a[1])*t);if(error>.035||gradeError>.025||t<0||t>1)out.push(b)}out.push(p.at(-1)!);return out}
/** Repair only sub-cell seams; deliberate deck and doorway gaps remain open. */
const joined=raw.map(simplify).filter(p=>p.length>1)
for(let changed=true;changed;){changed=false;outer:for(let i=0;i<joined.length;i++)for(let j=i+1;j<joined.length;j++)for(const reverseA of[false,true])for(const reverseB of[false,true]){const a=reverseA?[...joined[i]!].reverse():joined[i]!,b=reverseB?[...joined[j]!].reverse():joined[j]!,p=a.at(-1)!,q=b[0]!,d=Math.hypot(p[0]-q[0],p[2]-q[2]);if(d>.001&&d<.71&&Math.abs(p[1]-q[1])<.18&&onLand((p[0]+q[0])/2,(p[2]+q[2])/2)){joined[i]=[...a,...b];joined.splice(j,1);changed=true;break outer}}}
function roundCurb(path:V[]):V[]{
 const out:V[]=[path[0]!]
 for(let i=1;i<path.length-1;i++){
  const a=path[i-1]!,b=path[i]!,c=path[i+1]!,la=Math.hypot(b[0]-a[0],b[2]-a[2]),lc=Math.hypot(c[0]-b[0],c[2]-b[2]),trim=Math.min(.2,la*.28,lc*.28)
  if(trim<.015){out.push(b);continue}
  const p=b.map((v,k)=>v+(a[k]!-v)*trim/la)as unknown as V,q=b.map((v,k)=>v+(c[k]!-v)*trim/lc)as unknown as V,rounded:V[]=[p]
  for(let j=1;j<=3;j++){const t=j/3;rounded.push(b.map((_,k)=>(1-t)**2*p[k]!+2*t*(1-t)*b[k]!+t*t*q[k]!)as unknown as V)}
  // A fillet must stay on its own terrace, rather than dip through the retaining face.
  const top=inSummit(b[0],b[2]);if([a,c,...rounded].some(v=>inSummit(v[0],v[2])!==top)){out.push(b);continue}
  out.push(...rounded)
 }
 out.push(path.at(-1)!);return out
}
/** Long simplified edges must follow the terrain between their ends, too. */
function followGround(path:V[]):V[][]{
 const runs:V[][]=[[]];let out=runs[0]!
 for(let i=1;i<path.length;i++){const a=path[i-1]!,b=path[i]!,n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[2]-a[2])/.4))
  for(let j=i===1?0:1;j<=n;j++){const t=j/n,x=a[0]+(b[0]-a[0])*t,z=a[2]+(b[2]-a[2])*t,y=groundSurfaceHeight(x,z),previous=out.at(-1)
   // Terrace boundaries are vertical masonry, never a curb ramp down the wall.
   if(previous&&Math.abs(y-previous[1])>.35+.6*Math.hypot(x-previous[0],z-previous[2])){out=[];runs.push(out)}
   out.push([x,y,z])
  }
 }
 const first=runs[0]!,last=runs.at(-1)!
 if(runs.length>1&&first.length&&last.length&&Math.hypot(first[0]![0]-last.at(-1)![0],first[0]![1]-last.at(-1)![1],first[0]![2]-last.at(-1)![2])<.001){runs[0]=[...last,...first.slice(1)];runs.pop()}
 // Cutting at masonry must not leave a loose sub-metre stone chip on the road.
 return runs.filter(p=>p.length>1&&p.slice(1).reduce((sum,v,i)=>sum+Math.hypot(v[0]-p[i]![0],v[2]-p[i]![2]),0)>=.9)
}
export const curbPaths=joined.filter(p=>p.slice(1).reduce((sum,v,i)=>sum+Math.hypot(v[0]-p[i]![0],v[2]-p[i]![2]),0)>=.9).map(roundCurb).flatMap(followGround)
/** One joined indexed prism per boundary: no Euler-rotated boxes, exposed ends or overlapping corner blocks. */
export function createCurbGeometry(paths:readonly V[][]=curbPaths){
 const p:number[]=[],ix:number[]=[];const quad=(a:number,b:number,c:number,d:number)=>ix.push(a,b,c,a,c,d)
 for(const path of paths){const closed=Math.hypot(path[0]![0]-path.at(-1)![0],path[0]![2]-path.at(-1)![2])<.001,verts=closed?path.slice(0,-1):path,base=p.length/3
  for(let i=0;i<verts.length;i++){const v=verts[i]!,prev=verts[i?i-1:closed?verts.length-1:0]!,next=verts[i===verts.length-1?closed?0:i:i+1]!,normal=(a:V,b:V)=>{const dx=b[0]-a[0],dz=b[2]-a[2],l=Math.hypot(dx,dz)||1;return[-dz/l,dx/l]as const},a=normal(prev,v),b=normal(v,next);let nx=a[0]+b[0],nz=a[1]+b[1],length=Math.hypot(nx,nz);if(length<.01){nx=b[0]||a[0];nz=b[1]||a[1];length=Math.hypot(nx,nz)||1}nx/=length;nz/=length;const dot=Math.abs(nx*(b[0]||a[0])+nz*(b[1]||a[1])),width=Math.min(.16,.09/Math.max(.55,dot));for(const y of[-.04,.14])for(const side of[-1,1])p.push(v[0]+nx*width*side,v[1]+y,v[2]+nz*width*side)}
  const count=closed?verts.length:verts.length-1;for(let i=0;i<count;i++){const a=base+i*4,b=base+((i+1)%verts.length)*4;quad(a+2,a+3,b+3,b+2);quad(a,b,b+1,a+1);quad(a,a+2,b+2,b);quad(a+1,b+1,b+3,a+3)}if(!closed){quad(base,base+1,base+3,base+2);const e=base+(verts.length-1)*4;quad(e,e+2,e+3,e+1)}
 }
 const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(p,3));geometry.setIndex(ix);geometry.computeVertexNormals();geometry.computeBoundingBox();return geometry
}
export const curbGeometry=createCurbGeometry()
