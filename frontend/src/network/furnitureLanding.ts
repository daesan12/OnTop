import type { PhysicalBox } from '../map/park/physics'
import { FURNITURE_POLICY } from '../map/park/furnitureCollision'

/** A high fall or an overlap must slide out of a furniture movement column.
 * The BE must apply this same rule before validating client positions/landing state.
 */
export function furnitureLandingPosition(p:{x:number;y:number;z:number},boxes:readonly PhysicalBox[],footOffset:number,radius:number,counts:ReadonlyMap<string,number>) {
  const result={...p},foot=p.y-footOffset
  for(const b of boxes) {
    if(foot>b.center[1]+b.half[1]+FURNITURE_POLICY.landingHeightTolerance||p.y+footOffset<b.center[1]-b.half[1])continue
    const chair=/(.+)-chair-([0-7])$/.exec(b.id)
    if(chair&&Number(chair[2])+1>(counts.get(chair[1]!)??2))continue
    const c=Math.cos(b.yaw),s=Math.sin(b.yaw),dx=result.x-b.center[0],dz=result.z-b.center[2]
    let x=dx*c-dz*s,z=dx*s+dz*c
    const hx=b.half[0]+radius,hz=b.half[2]+radius
    if(Math.abs(x)>=hx||Math.abs(z)>=hz)continue
    if(hx-Math.abs(x)<hz-Math.abs(z))x=(x<0?-1:1)*(hx+FURNITURE_POLICY.exitGap)
    else z=(z<0?-1:1)*(hz+FURNITURE_POLICY.exitGap)
    result.x=b.center[0]+x*c+z*s;result.z=b.center[2]-x*s+z*c
  }
  return result
}

/** Rapier can keep a rounded capsule's edge contact grounded immediately after
 * the slide. That contact must not stop gravity above a no-climb column's base.
 */
export function furnitureAllowsSupport(p:{x:number;y:number;z:number},boxes:readonly PhysicalBox[],footOffset:number,radius:number,counts:ReadonlyMap<string,number>) {
 const foot=p.y-footOffset
 for(const b of boxes) {
  if(foot<=b.center[1]-b.half[1]+FURNITURE_POLICY.landingHeightTolerance||foot>b.center[1]+b.half[1]+FURNITURE_POLICY.landingHeightTolerance)continue
  const chair=/(.+)-chair-([0-7])$/.exec(b.id)
  if(chair&&Number(chair[2])+1>(counts.get(chair[1]!)??2))continue
  const dx=p.x-b.center[0],dz=p.z-b.center[2],c=Math.cos(b.yaw),s=Math.sin(b.yaw)
  if(Math.abs(dx*c-dz*s)<b.half[0]+radius+2*FURNITURE_POLICY.exitGap&&Math.abs(dx*s+dz*c)<b.half[2]+radius+2*FURNITURE_POLICY.exitGap)return false
 }
 return true
}
