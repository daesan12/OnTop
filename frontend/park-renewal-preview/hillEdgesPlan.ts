import {staticPark} from './static/store'
import {jumpFenceOpening} from './jumpAccessPlan.ts'
import {hillDistance} from './hillRoute.ts'
import {guardFloorY} from './groundSurface.ts'
import {heightAt,FACILITY_APPROACHES,MONUMENT_STAIRS,site,distanceToSegment,onRoad} from './plan.ts'
import {curbPaths} from './curbGeometry.ts'
import {summitFenceSections} from './summitWalls.ts'
import {inSummit,onSummitEdge,SUMMIT_HEIGHT} from './hybridTerrainPlan.ts'
import {hiddenExitGrade} from './horrorPlan.ts'
import {isPlantingGround} from './groundPlan.ts'
import {HILL_VERGE_INSET} from './guardDimensions.ts'
type V=readonly[number,number,number]
function createHillEdges(){
const hillEdgeSections:{a:number[];z:number[]}[]=[]
/** Remove tiny curb fillet segments before offsetting: their opposing mitres made spikes. */
function simplify(p:readonly V[]):V[]{
 if(p.length<3)return [...p]
 const a=p[0]!,b=p.at(-1)!,dx=b[0]-a[0],dz=b[2]-a[2],l=Math.hypot(dx,dz);let worst=.055,index=-1
 for(let i=1;i<p.length-1;i++){const v=p[i]!,t=l?Math.max(0,Math.min(1,((v[0]-a[0])*dx+(v[2]-a[2])*dz)/(l*l))):0,d=Math.hypot(v[0]-a[0]-dx*t,v[2]-a[2]-dz*t);if(d>worst){worst=d;index=i}}
 if(index<0)return[a,b]
 return[...simplify(p.slice(0,index+1)).slice(0,-1),...simplify(p.slice(index))]
}
function eligible(a:V,b:V){
 const x=(a[0]+b[0])/2,z=(a[2]+b[2])/2
 if(Math.hypot(x-site('jump').x,z-site('jump').z)<25&&jumpFenceOpening(x,z))return false
 if(inSummit(x,z)||x< -71&&z< -74&&hiddenExitGrade(x,z).distance<1.4)return false
 if(onSummitEdge(x,z,4)&&heightAt(x,z)<SUMMIT_HEIGHT-3||Math.min(heightAt(a[0],a[2]),heightAt(b[0],b[2]))<8&&hillDistance(x,z)>5)return false
 if(FACILITY_APPROACHES.some(p=>distanceToSegment(x,z,p.a,p.b)<p.width/2+.7))return false
 if(Math.abs(x-MONUMENT_STAIRS.x)<MONUMENT_STAIRS.width/2+.5&&Math.abs(z-MONUMENT_STAIRS.zTop)<1)return false
 const p=site('pagoda');return !(Math.abs(x-p.x)<27&&z<p.z+28)&&![[p.x-17,p.z],[p.x+17,p.z],[p.x,p.z-17],[p.x,p.z+17]].some(([a,b])=>Math.hypot(x-a!,z-b!)<3.5)
}
for(const original of curbPaths){
 const p=simplify(original),closed=Math.hypot(p[0]![0]-p.at(-1)![0],p[0]![2]-p.at(-1)![2])<.001,v=closed?p.slice(0,-1):p
 if(v.length<2)continue
 const normals=v.map((a,i)=>{const b=v[i+1]??(closed?v[0]!:a),dx=b[0]-a[0],dz=b[2]-a[2],l=Math.hypot(dx,dz)||1,x=(a[0]+b[0])/2,z=(a[2]+b[2])/2;let nx=-dz/l,nz=dx/l;if(!isPlantingGround(x+nx*.3,z+nz*.3)){nx=-nx;nz=-nz}return[nx,nz]as const})
 const shifted=v.map((p,i)=>{const prev=normals[i?i-1:closed?v.length-1:0]!,next=normals[i===v.length-1&&!closed?Math.max(0,i-1):i]!,nx=prev[0]+next[0],nz=prev[1]+next[1],l=Math.hypot(nx,nz),ux=l>.01?nx/l:next[0],uz=l>.01?nz/l:next[1],d=Math.min(HILL_VERGE_INSET*1.4,HILL_VERGE_INSET/Math.max(.65,Math.abs(ux*next[0]+uz*next[1]))),x=p[0]+ux*d,z=p[2]+uz*d;return[x,guardFloorY(x,z),z]})
 for(let i=0;i<(closed?v.length:v.length-1);i++){
  const j=(i+1)%v.length,a=shifted[i]!,b=shifted[j]!,n=Math.max(1,Math.ceil(Math.hypot(b[0]!-a[0]!,b[2]!-a[2]!)/.5))
  const point=(t:number)=>{const x=a[0]!+(b[0]!-a[0]!)*t,z=a[2]!+(b[2]!-a[2]!)*t;return[x,guardFloorY(x,z),z]}
  const originalPoint=(t:number):V=>v[i]!.map((c,k)=>c+(v[j]![k]!-c)*t)as unknown as V
  // Check short spans: an exit crossing must not remove an entire long curb edge.
  for(let k=0;k<n;k++){
   if(!eligible(originalPoint(k/n),originalPoint((k+1)/n)))continue
   const p=point(k/n),q=point((k+1)/n),x=(p[0]!+q[0]!)/2,z=(p[2]!+q[2]!)/2
   if(!isPlantingGround(x,z)||onRoad(x,z,-.04)||onSummitEdge(x,z,3.5)&&Math.min(p[1]!,q[1]!)<18.8)continue
   hillEdgeSections.push({a:p,z:q})
  }
 }
}
const ends=(sections:typeof hillEdgeSections)=>{const points=new Map<string,{p:number[];n:number}>();for(const s of sections)for(const p of[s.a,s.z]){const key=p.map(v=>v.toFixed(3)).join(','),old=points.get(key);if(old)old.n++;else points.set(key,{p,n:1})}return [...points.values()].filter(p=>p.n===1).map(p=>p.p)}
const lowerEnds=ends(hillEdgeSections),upperEnds=ends(summitFenceSections)
for(const p of upperEnds){let best:number[]|undefined,distance=2;for(const q of lowerEnds){const d=Math.hypot(p[0]!-q[0]!,p[2]!-q[2]!);if(d>.04&&d<distance&&Math.abs(p[1]!-q[1]!)<1.2&&isPlantingGround((p[0]!+q[0]!)/2,(p[2]!+q[2]!)/2)){best=q;distance=d}}if(best){hillEdgeSections.push({a:p,z:best});lowerEnds.splice(lowerEnds.indexOf(best),1)}}
hillEdgeSections.push(...summitFenceSections)
for(const s of hillEdgeSections)for(const p of[s.a,s.z])p[1]=guardFloorY(p[0]!,p[2]!)

return hillEdgeSections
}
export const hillEdgeSections=staticPark?.hillEdges??createHillEdges()
