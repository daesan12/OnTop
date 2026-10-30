import type { PhysicalBox } from '../map/park/physics'
import { FURNITURE_POLICY } from '../map/park/furnitureCollision'

/** A high fall must slide off furniture barriers instead of standing on an invisible top.
 * The BE must apply this same rule before validating client positions/landing state.
 */
export function furnitureLandingPosition(p:{x:number;y:number;z:number},boxes:readonly PhysicalBox[],footOffset:number,radius:number,counts:ReadonlyMap<string,number>) {
  const result={...p},foot=p.y-footOffset
  for(const b of boxes) {
    if(Math.abs(foot-(b.center[1]+b.half[1]))>FURNITURE_POLICY.landingHeightTolerance)continue
    const chair=/(.+)-chair-([0-3])$/.exec(b.id)
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
