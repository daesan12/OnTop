/** Public ascent only. Facility, seat, lamp and interaction anchors remain fixed. */
export const HILL_ROAD_WIDTH=6.4
export const HILL_COORDINATES={
 'west-fork':[-75,-8],hill0:[-89,-17],hillFrontBend:[-92,-24],hillFrontReturn:[-76,-29],hill1:[-73,-47],
 hillBend:[-82,-55],hill2:[-85,-65],hillFarBend:[-81,-72],'hill-loop':[-70,-82],hillTurn:[-65,-78],
 'hill-cross':[-65,-58],hillPortal:[-58,-58],summitBend:[-54,-58],
}as const
export const HILL_NODE_IDS=Object.keys(HILL_COORDINATES)as(keyof typeof HILL_COORDINATES)[]
const lower=HILL_NODE_IDS.slice(0,5),dist=[0]
for(let i=1;i<lower.length;i++){const a=HILL_COORDINATES[lower[i-1]!]!,b=HILL_COORDINATES[lower[i]!]!;dist.push(dist.at(-1)!+Math.hypot(b[0]-a[0],b[1]-a[1]))}
export const HILL_HEIGHTS:Readonly<Record<string,number>>={
 ...Object.fromEntries(lower.map((id,i)=>[id,6+(12.7-6)*dist[i]!/dist.at(-1)!])),
 hillBend:14.2,hill2:15.6,hillFarBend:16.8,'hill-loop':19,hillTurn:19,'hill-cross':21.5,hillPortal:22,summitBend:22,
}
const hillContext=[[-86,12],[-81,2],...HILL_NODE_IDS.map(id=>HILL_COORDINATES[id])]as readonly(readonly[number,number])[]
export function hillDistance(x:number,z:number){let result=Infinity;const points=hillContext;for(let i=1;i<points.length;i++){const a=points[i-1]!,b=points[i]!,dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));result=Math.min(result,Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t))}return result}

/** Station along the ascent distinguishes neighbouring switchback levels. */
export function hillStation(x:number,z:number){let nearest=Infinity,result=0,station=0;for(let i=1;i<hillContext.length;i++){const a=hillContext[i-1]!,b=hillContext[i]!,dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(length*length))),d=Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t);if(d<nearest){nearest=d;result=station+length*t}station+=length}return result}
