import {boundaryFrame} from './contextPlan.ts'

/** Collision data only. No render mesh/material is created for the invisible extension. */
export const PERIMETER_COLLISION={bottom:-128,top:1024,innerDepth:.35,halfDepth:4,segments:360}as const
export const PERIMETER_COLLIDERS=Array.from({length:PERIMETER_COLLISION.segments},(_,i)=>{
 const a=boundaryFrame(i/PERIMETER_COLLISION.segments*Math.PI*2),b=boundaryFrame((i+1)/PERIMETER_COLLISION.segments*Math.PI*2),dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz),outset=PERIMETER_COLLISION.halfDepth-PERIMETER_COLLISION.innerDepth
 // Keep the original inner face and player clearance. Expand only outside the
 // park: tall, thin Bullet boxes can miss longer convex sweeps during fast falls.
 return{id:`renewal-invisible-perimeter-${i}`,role:'solid' as const,center:[(a.x+b.x)/2+dz/length*outset,(PERIMETER_COLLISION.top+PERIMETER_COLLISION.bottom)/2,(a.z+b.z)/2-dx/length*outset],half:[length/2+.08,(PERIMETER_COLLISION.top-PERIMETER_COLLISION.bottom)/2,PERIMETER_COLLISION.halfDepth],yaw:Math.atan2(-dz,dx)}
})
