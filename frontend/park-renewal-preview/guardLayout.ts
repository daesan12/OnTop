import {staticPark} from './static/store'
import {guardFloorY} from './groundSurface.ts'
import {hillEdgeSections} from './hillEdgesPlan.ts'
import {HILL_ROAD_WIDTH,hillDistance} from './hillRoute.ts'
import {MONUMENT_STAIRS,NODES,STATION_APPROACH,distanceToSegment} from './plan.ts'
import {HILL_VERGE_INSET,MONUMENT_STAIR_RAIL} from './guardDimensions'
import {BufferGeometry,Float32BufferAttribute} from 'three'
type V=readonly[number,number,number]
function createGuards(){
const points:V[]=[],ids=new Map<string,number>(),links=new Map<number,number[]>(),unused=new Set<string>()
const id=(p:number[])=>{const k=p.map(v=>v.toFixed(3)).join(','),old=ids.get(k);if(old!==undefined)return old;const n=points.length;points.push([p[0]!,p[1]!,p[2]!]);ids.set(k,n);return n},key=(a:number,b:number)=>Math.min(a,b)+':'+Math.max(a,b)
for(const s of hillEdgeSections){const a=id(s.a),b=id(s.z),k=key(a,b);if(a===b||unused.has(k))continue;unused.add(k);for(const[x,z]of[[a,b],[b,a]]){const v=links.get(x!)??[];v.push(z!);links.set(x!,v)}}
const raw:V[][]=[]
const trace=(start:number,next:number)=>{const out=[points[start]!];let a=start,b=next;while(unused.has(key(a,b))){unused.delete(key(a,b));out.push(points[b]!);const c=links.get(b)?.find(v=>unused.has(key(b,v)));if(c===undefined)break;a=b;b=c}raw.push(out)}
for(const[a,list]of links)if(list.length!==2)for(const b of list)if(unused.has(key(a,b)))trace(a,b)
for(const[a,list]of links)for(const b of list)if(unused.has(key(a,b)))trace(a,b)
/** Short return hooks at grade/summit joins must not become crossing rail faces. */
function finishGuardPath(path:V[]):V[]{
 const p:V[]=[];for(const v of path)if(!p.length||Math.hypot(v[0]-p.at(-1)![0],v[2]-p.at(-1)![2])>.14)p.push(v)
 if(p.length<3)return p
 for(let changed=true;changed;){changed=false;for(let i=1;i<p.length-1;i++){const a=p[i-1]!,b=p[i]!,c=p[i+1]!,ux=b[0]-a[0],uz=b[2]-a[2],vx=c[0]-b[0],vz=c[2]-b[2],dot=(ux*vx+uz*vz)/(Math.hypot(ux,uz)*Math.hypot(vx,vz)),dx=c[0]-a[0],dz=c[2]-a[2],l=Math.hypot(dx,dz),error=l?Math.abs(dx*(a[2]-b[2])-(a[0]-b[0])*dz)/l:0;if(dot<-.05&&error<.5){p.splice(i,1);changed=true;break}}}
 const out:V[]=[p[0]!];for(let i=1;i<p.length-1;i++){const a=p[i-1]!,b=p[i]!,c=p[i+1]!,la=Math.hypot(b[0]-a[0],b[2]-a[2]),lc=Math.hypot(c[0]-b[0],c[2]-b[2]),trim=Math.min(.18,la*.3,lc*.3),u=[b[0]+(a[0]-b[0])*trim/la,b[2]+(a[2]-b[2])*trim/la],v=[b[0]+(c[0]-b[0])*trim/lc,b[2]+(c[2]-b[2])*trim/lc];for(let j=0;j<=4;j++){const t=j/4,x=(1-t)**2*u[0]!+2*(1-t)*t*b[0]+t*t*v[0]!,z=(1-t)**2*u[1]!+2*(1-t)*t*b[2]+t*t*v[1]!;out.push([x,guardFloorY(x,z),z])}}out.push(p.at(-1)!);return out
}
const sampledRuns=raw.map(finishGuardPath).filter(path=>path.length>1).map(path=>{const out:V[]=[path[0]!];for(let i=1;i<path.length;i++){const a=path[i-1]!,b=path[i]!,n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[2]-a[2])/.5));for(let j=1;j<=n;j++){const x=a[0]+(b[0]-a[0])*j/n,z=a[2]+(b[2]-a[2])*j/n;out.push([x,guardFloorY(x,z),z])}}return out})
/** Rail heads follow a smooth grade; feet still touch the exact soil triangles. */
const guardRuns=sampledRuns.map(path=>{const d=[0];for(let i=1;i<path.length;i++)d.push(d.at(-1)!+Math.hypot(path[i]![0]-path[i-1]![0],path[i]![2]-path[i-1]![2]));return path.map((p,i)=>{let sum=0,weight=0;for(let j=i;j>=0&&d[i]!-d[j]!<2.4;j--){const span=((d[Math.min(path.length-1,j+1)]!-d[Math.max(0,j-1)]!)/2)||.01,w=Math.exp(-.5*Math.pow((d[i]!-d[j]!)/.85,2))*span;sum+=path[j]![1]*w;weight+=w}for(let j=i+1;j<path.length&&d[j]!-d[i]!<2.4;j++){const span=((d[Math.min(path.length-1,j+1)]!-d[Math.max(0,j-1)]!)/2)||.01,w=Math.exp(-.5*Math.pow((d[j]!-d[i]!)/.85,2))*span;sum+=path[j]![1]*w;weight+=w}return[p[0],sum/weight,p[2]]as V})})
const guardPostRailBases:number[]=[]
const guardPosts:number[][]=[]
for(const path of guardRuns){const cumulative=[0];for(let i=1;i<path.length;i++)cumulative.push(cumulative.at(-1)!+Math.hypot(path[i]![0]-path[i-1]![0],path[i]![2]-path[i-1]![2]));const length=cumulative.at(-1)!,n=Math.max(1,Math.ceil(length/2)),closed=Math.hypot(path[0]![0]-path.at(-1)![0],path[0]![2]-path.at(-1)![2])<.002;for(let i=0;i<=(closed?n-1:n);i++){const d=i/n*length;let k=1;while(k<cumulative.length-1&&cumulative[k]!<d)k++;const a=path[k-1]!,b=path[k]!,t=(d-cumulative[k-1]!)/(cumulative[k]!-cumulative[k-1]!||1),x=a[0]+(b[0]-a[0])*t,z=a[2]+(b[2]-a[2])*t;if(!guardPosts.some(p=>Math.hypot(x-p[0]!,z-p[2]!)<.01)){guardPosts.push([x,guardFloorY(x,z),z]);guardPostRailBases.push(a[1]+(b[1]-a[1])*t)}}}
return {guardRuns,guardPosts,guardPostRailBases}
}
const guardData=staticPark?.guards??createGuards()
const stairHalfWidth=MONUMENT_STAIRS.width/2
const stairRailJoint=stairHalfWidth+MONUMENT_STAIR_RAIL.sideOffset+MONUMENT_STAIR_RAIL.postWidth/2
const isOldStairEnd=(point:readonly number[])=>
 Math.abs(Math.abs(point[0]!-MONUMENT_STAIRS.x)-stairHalfWidth)<.01&&
 Math.abs(point[2]!-(MONUMENT_STAIRS.zTop-HILL_VERGE_INSET))<.01

// Use the stone newel at the landing to close both timber rails. This also
// corrects the two endpoints in the existing baked guard data.
export const guardRuns=guardData.guardRuns.map(path=>path.map((point):V=>
 isOldStairEnd(point)
  ? [MONUMENT_STAIRS.x+Math.sign(point[0]-MONUMENT_STAIRS.x)*stairRailJoint,point[1],point[2]]
  : point))
const posts=guardData.guardPosts.flatMap((point,index)=>isOldStairEnd(point)
 ? []
 : [{point,railBase:guardData.guardPostRailBases[index]!}])
export const guardPosts=posts.map(post=>post.point)
export const guardPostRailBases=posts.map(post=>post.railBase)

export function onBalloonAscent(x:number,z:number){
 const reach=HILL_ROAD_WIDTH/2+2.5
 return hillDistance(x,z)<=reach||
  distanceToSegment(x,z,NODES.summitBend!,NODES.summitFrontBend!)<=reach||
  distanceToSegment(x,z,NODES.summitFrontBend!,STATION_APPROACH.a)<=reach||
  distanceToSegment(x,z,STATION_APPROACH.a,STATION_APPROACH.b)<=reach
}

export const ascentFenceRuns:V[][]=[]
export const hillsideGuardRuns:V[][]=[]
for(const path of guardRuns){
 let run:V[]=[]
 let previousStyle: boolean|undefined
 for(let i=1;i<path.length;i++){
  const a=path[i-1]!,b=path[i]!
  const ascent=onBalloonAscent((a[0]+b[0])/2,(a[2]+b[2])/2)
  if(ascent!==previousStyle){
   run=[a]
   const runs=ascent?ascentFenceRuns:hillsideGuardRuns
   runs.push(run)
   previousStyle=ascent
  }
  run.push(b)
 }
}

/** A single welded rectangular sweep eliminates box end faces at every joint. */
export function guardRailGeometry(paths:readonly V[][],height:number){const p:number[]=[],ix:number[]=[],quad=(a:number,b:number,c:number,d:number)=>ix.push(a,b,c,a,c,d)
 for(const path of paths){const closed=Math.hypot(path[0]![0]-path.at(-1)![0],path[0]![2]-path.at(-1)![2])<.002,v=closed?path.slice(0,-1):path,base=p.length/3;if(v.length<2)continue
  for(let i=0;i<v.length;i++){const a=v[i?i-1:closed?v.length-1:0]!,b=v[i]!,c=v[i<v.length-1?i+1:closed?0:i]!,normal=(a:V,b:V)=>{const x=b[0]-a[0],z=b[2]-a[2],l=Math.hypot(x,z)||1;return[-z/l,x/l]},n=normal(a,b),m=normal(b,c);let x=n[0]!+m[0]!,z=n[1]!+m[1]!,l=Math.hypot(x,z);if(l<.01){x=m[0]||n[0]!;z=m[1]||n[1]!;l=Math.hypot(x,z)||1}x/=l;z/=l;const dot=Math.abs(x*(m[0]||n[0]!)+z*(m[1]||n[1]!)),w=Math.min(.09,.045/Math.max(.5,dot));for(const y of[-.045,.045])for(const side of[-1,1])p.push(b[0]+x*w*side,b[1]+height+y,b[2]+z*w*side)}
  const count=closed?v.length:v.length-1;for(let i=0;i<count;i++){const a=base+i*4,b=base+((i+1)%v.length)*4;quad(a+2,a+3,b+3,b+2);quad(a,b,b+1,a+1);quad(a,a+2,b+2,b);quad(a+1,b+1,b+3,a+3)}if(!closed){quad(base,base+1,base+3,base+2);const e=base+(v.length-1)*4;quad(e,e+2,e+3,e+1)}}
 const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(p,3));g.setIndex(ix);g.computeVertexNormals();g.computeBoundingBox();return g}
