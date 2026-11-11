import {HILL_COORDINATES,HILL_NODE_IDS,HILL_HEIGHTS,hillDistance,hillStation} from './hillRoute.ts'
import {inSummit} from './hybridTerrainPlan.ts'

const points=[[-86,12],[-81,2],...HILL_NODE_IDS.map(id=>HILL_COORDINATES[id])]as readonly(readonly[number,number])[]
const heights=[4.5,5,...HILL_NODE_IDS.map(id=>HILL_HEIGHTS[id]!)]
const grid={x:-103,z:-96,w:51,h:125}
let field:Float64Array|undefined
const smooth=(t:number)=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t)}
function target(x:number,z:number){let sum=0,total=0;for(let i=1;i<points.length;i++){const a=points[i-1]!,b=points[i]!,dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz))),d=Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t),w=Math.exp(-d*d/8);sum+=(heights[i-1]!*(1-t)+heights[i]!*t)*w;total+=w}return sum/total}
/** Solve each ramp level separately: nearby switchback legs must not pull one another sideways. */
function solve(){
 if(field)return field
 const n=grid.w*grid.h,v=new Float64Array(n),active=new Uint8Array(n),fixed=new Uint8Array(n),station=new Float64Array(n)
 for(let i=0;i<grid.w;i++)for(let j=0;j<grid.h;j++){const k=i*grid.h+j,x=grid.x+i,z=grid.z+j;v[k]=target(x,z);active[k]=hillDistance(x,z)<5.5?1:0;station[k]=hillStation(x,z);if(z>=-8)fixed[k]=1;if(x>=-59){v[k]=22;fixed[k]=1}}
 // The component is only the road and its shoulder. The wooded space between
 // different ramp levels is deliberately excluded from the grade constraint.
 for(let pass=0;pass<4000;pass++){let worst=0;for(let i=1;i<grid.w-1;i++)for(let j=1;j<grid.h-1;j++){const a=i*grid.h+j;if(!active[a])continue;for(const b of[a+1,a+grid.h]){if(!active[b]||Math.abs(station[a]!-station[b]!)>14||fixed[a]&&fixed[b])continue;const d=v[b]!-v[a]!,excess=Math.abs(d)-.105;if(excess<=.00001)continue;worst=Math.max(worst,excess);const change=Math.sign(d)*excess;if(fixed[a])v[b]!-=change;else if(fixed[b])v[a]!+=change;else{v[a]!+=change/2;v[b]!-=change/2}}}if(worst<.0001)break}
 field=v;return v
}
export function hillGradedHeight(x:number,z:number,fallback:number){
 if(inSummit(x,z)||x<grid.x+2||x>grid.x+grid.w-3||z<grid.z+2||z>grid.z+grid.h-3)return fallback
 const distance=hillDistance(x,z);if(distance>=6.5)return fallback
 const v=solve(),xx=x-grid.x,zz=z-grid.z,i=Math.floor(xx),j=Math.floor(zz),station=hillStation(x,z),weights=(t:number)=>[(1-t)**3/6,(3*t**3-6*t*t+4)/6,(-3*t**3+3*t*t+3*t+1)/6,t**3/6],wx=weights(xx-i),wz=weights(zz-j)
 let sum=0,total=0
 for(let a=0;a<4;a++)for(let b=0;b<4;b++){const px=grid.x+i+a-1,pz=grid.z+j+b-1;if(Math.abs(hillStation(px,pz)-station)>14)continue;const w=wx[a]!*wz[b]!;sum+=v[(i+a-1)*grid.h+j+b-1]!*w;total+=w}
 const blend=1-smooth((distance-3.9)/2.6)
 return fallback*(1-blend)+sum/total*blend
}
