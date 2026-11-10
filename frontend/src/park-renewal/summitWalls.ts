import {HILL_VERGE_INSET} from './guardDimensions.ts'
import {SUMMIT_OUTLINE,inSummit,SUMMIT_HEIGHT,type TerrainPoint} from './hybridTerrainPlan.ts'
import {EDGES,NODES,distanceToSegment,MONUMENT_STAIRS} from './plan.ts'
export interface SummitWall {a:TerrainPoint;b:TerrainPoint;nx:number;nz:number}
/** Keep deliberate openings for the western approach and original direct stair. */
export function summitPortal(x:number,z:number){
 if(Math.abs(z-MONUMENT_STAIRS.zTop)<1&&Math.abs(x-MONUMENT_STAIRS.x)<MONUMENT_STAIRS.width/2+.025)return true
 return EDGES.some(([a,b,w])=>inSummit(...NODES[a]!)!==inSummit(...NODES[b]!)&&distanceToSegment(x,z,NODES[a]!,NODES[b]!)<w/2+.5)
}
export const summitWalls:SummitWall[]=[]
for(let i=0;i<SUMMIT_OUTLINE.length;i++){
 const a=SUMMIT_OUTLINE[i]!,b=SUMMIT_OUTLINE[(i+1)%SUMMIT_OUTLINE.length]!,dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),n=Math.ceil(length/.25)
 let nx=-dz/length,nz=dx/length
 if(inSummit((a[0]+b[0])/2+nx*.1,(a[1]+b[1])/2+nz*.1)){nx=-nx;nz=-nz}
 let start:number|undefined
 for(let k=0;k<=n;k++){
  const t=(k+.5)/n,open=k===n||summitPortal(a[0]+dx*t,a[1]+dz*t)
  if(!open&&start===undefined)start=k/n
  if(open&&start!==undefined){summitWalls.push({a:[a[0]+dx*start,a[1]+dz*start],b:[a[0]+dx*k/n,a[1]+dz*k/n],nx,nz});start=undefined}
 }
}
export const summitFenceSections=summitWalls.flatMap(w=>{
 const dx=w.b[0]-w.a[0],dz=w.b[1]-w.a[1],n=Math.ceil(Math.hypot(dx,dz)/2.2)
 const point=(v:TerrainPoint)=>{const other=summitWalls.find(q=>q!==w&&[q.a,q.b].some(p=>Math.hypot(p[0]-v[0],p[1]-v[1])<1e-5)),den=other?1+w.nx*other.nx+w.nz*other.nz:1;return[v[0]-(w.nx+(other?.nx??0))*HILL_VERGE_INSET/den,SUMMIT_HEIGHT+.12,v[1]-(w.nz+(other?.nz??0))*HILL_VERGE_INSET/den]}
 const a=point(w.a),b=point(w.b),p=(t:number)=>a.map((v,i)=>v+(b[i]!-v)*t)
 return Array.from({length:n},(_,i)=>({a:p(i/n),z:p((i+1)/n)}))
})
