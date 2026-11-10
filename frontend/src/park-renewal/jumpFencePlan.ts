import {staticPark} from './static/store'
import {guardFloorY} from './groundSurface.ts'
import {curbPaths} from './curbGeometry.ts'
import {inPolygon} from './roundedFootprint.ts'
import {isPlantingGround} from './groundPlan.ts'
import {site,distanceToSegment,type Point} from './plan.ts'
import {jumpFenceOpening} from './jumpAccessPlan.ts'
export {jumpFenceOpening,JUMP_GATE} from './jumpAccessPlan.ts'
import {hillEdgeSections} from './hillEdgesPlan.ts'
type V=readonly[number,number,number]
function createJumpFence(){
const s=site('jump'),loops=curbPaths.filter(p=>Math.hypot(p[0]![0]-p.at(-1)![0],p[0]![2]-p.at(-1)![2])<.05&&inPolygon(s.x,s.z,p.map(v=>[v[0],v[2]])))
const area=(p:readonly V[])=>Math.abs(p.reduce((a,v,i)=>{const q=p[(i+1)%p.length]!;return a+v[0]*q[2]-q[0]*v[2]},0))
const loop=loops.sort((a,b)=>area(a)-area(b))[0]
if(!loop)throw new Error('Jump garden needs a closed grass boundary')
const sharedEdges=hillEdgeSections.filter(e=>Math.hypot((e.a[0]!+e.z[0]!)/2-s.x,(e.a[2]!+e.z[2]!)/2-s.z)<30)
const sharedHillBoundary=(x:number,z:number)=>{const y=guardFloorY(x,z);return sharedEdges.some(e=>Math.abs((e.a[1]!+e.z[1]!)/2-y)<1.2&&distanceToSegment(x,z,[e.a[0]!,e.a[2]!],[e.z[0]!,e.z[2]!])<1.05)}
const jumpFenceRuns:V[][]=[]
let run:V[]=[]
for(let i=0;i<loop.length-1;i++){const a=loop[i]!,b=loop[i+1]!,dx=b[0]-a[0],dz=b[2]-a[2],l=Math.hypot(dx,dz);if(l<.001)continue;const mx=(a[0]+b[0])/2,mz=(a[2]+b[2])/2,side=isPlantingGround(mx-dz/l*.4,mz+dx/l*.4)?1:-1,n=Math.max(1,Math.ceil(l/.4));for(let j=0;j<n;j++){const x=a[0]+dx*j/n-dz/l*.6*side,z=a[2]+dz*j/n+dx/l*.6*side;if(jumpFenceOpening(x,z)||sharedHillBoundary(x,z)||!isPlantingGround(x,z)){if(run.length>1)jumpFenceRuns.push(run);run=[];continue}run.push([x,guardFloorY(x,z),z])}}
if(run.length>1)jumpFenceRuns.push(run)
if(jumpFenceRuns.length>1){const a=jumpFenceRuns.at(-1)!,b=jumpFenceRuns[0]!;if(Math.hypot(a.at(-1)![0]-b[0]![0],a.at(-1)![2]-b[0]![2])<1.4){jumpFenceRuns[0]=[...a,...b];jumpFenceRuns.pop()}}
const jumpFenceSections=jumpFenceRuns.flatMap(p=>p.slice(1).map((b,i)=>({a:[p[i]![0],p[i]![2]]as Point,z:[b[0],b[2]]as Point})))

return {runs:jumpFenceRuns,sections:jumpFenceSections}
}
const fence=staticPark?.jumpFence??createJumpFence()
export const jumpFenceRuns=fence.runs,jumpFenceSections=fence.sections
