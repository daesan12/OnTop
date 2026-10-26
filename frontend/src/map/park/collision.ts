import { insideRoundedSquare } from '../geometry'
import type { ParkDefinition,MapPoint } from './definition'

type Box={id:string;x:number;z:number;halfX:number;halfZ:number}
type Run={from:MapPoint;to:MapPoint;id?:string}
export type MapObstacle =
  | {id:string;kind:'box';x:number;z:number;halfX:number;halfZ:number;yaw:number}
  | {id:string;kind:'circle';x:number;z:number;radius:number}
  | {id:string;kind:'segment';from:MapPoint;to:MapPoint;radius:number}
  | {id:string;kind:'annular-sector';x:number;z:number;innerRadius:number;outerRadius:number;startAngle:number;endAngle:number}
export interface MapCollision {
  boundary:{kind:'rounded-square';half:number;radius:number}
  obstacles:readonly MapObstacle[]
}
/** Effective 2D walking footprints, preserving the preview's existing clearance. */
export function buildCollision(input:{definition:ParkDefinition;boxes:readonly Box[];
  kiosks:readonly {kind:string;x:number;z:number;width:number;depth:number;yaw:number}[];
  fences:readonly Run[];lamps:readonly (readonly [number,number,number])[];fishingRails:readonly Run[];shoreRails:readonly Run[]
}):MapCollision {
  const {definition:d}=input,r=d.collision,kioskIds=new Set(input.kiosks.map(k=>'layout-'+k.kind))
  const segments=(runs:readonly Run[],prefix:string,radius:number):MapObstacle[]=>runs.map((s,i)=>({id:s.id??`${prefix}-${i}`,kind:'segment',from:s.from,to:s.to,radius}))
  const gap=Math.asin(r.fitnessBenchGapSin)/2
  return {
    boundary:{kind:'rounded-square',half:d.park.size/2-d.park.movementInset,radius:d.park.movementCornerRadius},
    obstacles:[
      ...input.boxes.filter(b=>!kioskIds.has(b.id)).map((b):MapObstacle=>({...b,kind:'box',halfX:b.halfX+r.boxClearance,halfZ:b.halfZ+r.boxClearance,yaw:0})),
      ...input.kiosks.map((k):MapObstacle=>({id:'layout-'+k.kind,kind:'box',x:k.x,z:k.z,halfX:k.width/2+r.boxClearance,halfZ:k.depth/2+r.boxClearance,yaw:k.yaw})),
      ...segments(input.fences,'fence',r.fenceRadius),
      ...input.lamps.map((p,i):MapObstacle=>({id:'layout-lamp-'+i,kind:'circle',x:p[0],z:p[2],radius:r.lampRadius})),
      ...segments(input.fishingRails,'fishing-rail',r.fishingRailRadius),...segments(input.shoreRails,'shore-rail',r.shoreRailRadius),
      {id:'fitness-rest-tree',kind:'circle',...d.sites.fitness,radius:r.fitnessTreeRadius},
      ...Array.from({length:4},(_,i):MapObstacle=>({id:'fitness-ring-bench-'+i,kind:'annular-sector',...d.sites.fitness,innerRadius:r.fitnessBenchInner,outerRadius:r.fitnessBenchOuter,startAngle:i*Math.PI/2+gap,endAngle:(i+1)*Math.PI/2-gap})),
    ],
  }
}
export function segmentDistance(x:number,z:number,a:MapPoint,b:MapPoint) {
  const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)))
  return Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz)
}
export function obstacleContains(obstacle:MapObstacle,x:number,z:number) {
  if(obstacle.kind==='segment')return segmentDistance(x,z,obstacle.from,obstacle.to)<obstacle.radius
  const dx=x-obstacle.x,dz=z-obstacle.z
  if(obstacle.kind==='circle')return Math.hypot(dx,dz)<obstacle.radius
  if(obstacle.kind==='box')return Math.abs(dx*Math.cos(obstacle.yaw)-dz*Math.sin(obstacle.yaw))<obstacle.halfX&&Math.abs(dx*Math.sin(obstacle.yaw)+dz*Math.cos(obstacle.yaw))<obstacle.halfZ
  const radius=Math.hypot(dx,dz),angle=(Math.atan2(dz,dx)+Math.PI*2)%(Math.PI*2)
  return radius>obstacle.innerRadius&&radius<obstacle.outerRadius&&angle>obstacle.startAngle&&angle<obstacle.endAngle
}
export function isWalkable(collision:MapCollision,x:number,z:number) {
  return Number.isFinite(x)&&Number.isFinite(z)&&insideRoundedSquare(x,z,collision.boundary.half,collision.boundary.radius)&&!collision.obstacles.some(o=>obstacleContains(o,x,z))
}
