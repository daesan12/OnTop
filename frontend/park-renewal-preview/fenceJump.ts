import { PARK_MOTION, ParkMotion } from '../src/network/parkMotion'
import { groundSurfaceHeight } from './groundSurface'
import { clearMotionSegment, fitnessFenceSegments, jumpFenceSegments, standableFenceTopAt } from './motionPlan'
import { site, type Point } from './plan'

export type FenceJumpSite = 'fitness' | 'jump'

export function fenceJumpRoute(id:FenceJumpSite){
 const near:Point=id==='fitness'?[-9,68]:[-55,21]
 const segments=id==='fitness'?fitnessFenceSegments():jumpFenceSegments()
 const centerOf=({a,z}:typeof segments[number]):Point=>[(a[0]+z[0])/2,(a[1]+z[1])/2]
 const distance=([x,z]:Point)=>Math.hypot(x-near[0],z-near[1])
 const segment=segments.reduce((closest,current)=>distance(centerOf(current))<distance(centerOf(closest))?current:closest)
 const center=centerOf(segment)
 const dx=segment.z[0]-segment.a[0],dz=segment.z[1]-segment.a[1]
 const length=Math.hypot(dx,dz)
 const facility=site(id)
 const inward=Math.sign((facility.x-center[0])*(-dz)+(facility.z-center[1])*dx)||1
 const direction:Point=[-dz/length*inward,dx/length*inward]
 const takeoffDistance=1.2
 const start:Point=[center[0]-direction[0]*takeoffDistance,center[1]-direction[1]*takeoffDistance]
 return {start,center,direction,takeoffDistance,floor:groundSurfaceHeight(...start)}
}

export function createFenceJump(id:FenceJumpSite){
 const route=fenceJumpRoute(id)
 return {route,motion:new ParkMotion(),position:route.start,y:route.floor,launched:false,distance:0,finished:false,landedOnFence:false}
}

export function stepFenceJump(jump:ReturnType<typeof createFenceJump>,delta:number){
 const {route}=jump
 let remaining=Math.min(delta,.1)
 while(remaining>1e-6&&!jump.finished){
  const dt=Math.min(remaining,1/120)
  remaining-=dt
  const vertical=jump.motion.advance({dx:0,dz:0,run:false,jump:!jump.launched},dt,!jump.launched)
  jump.launched=true
  const footY=jump.y+vertical.y
  const distance=Math.min(route.takeoffDistance,jump.distance+PARK_MOTION.walkSpeed*dt)
  const next:Point=distance===route.takeoffDistance?route.center:[
   route.start[0]+route.direction[0]*distance,
   route.start[1]+route.direction[1]*distance,
  ]
  if(clearMotionSegment(jump.position,next,Math.min(jump.y,footY))){
   jump.position=next
   jump.distance=distance
  }
  const ground=groundSurfaceHeight(...jump.position)
  const fence=standableFenceTopAt(...jump.position,jump.y)
  const floor=Math.max(ground,fence)
  jump.finished=vertical.velocityY<0&&footY<=floor
  jump.landedOnFence=jump.finished&&fence>ground
  jump.y=jump.finished?floor:footY
 }
}
