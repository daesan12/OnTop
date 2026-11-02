import { tableScale,tableSeats } from '../../config/table-seats'
import type { TableAnchor } from '../../config/world'
import type { PhysicalBox } from './physics'

/** Existing service policy: furniture is a 2.5m movement barrier, not a jump platform.
 * Horizontal dimensions are model bounds with no character radius/margin added.
 * Keep rails separate: their finite 1.22m height remains jumpable.
 */
export const FURNITURE_MOVEMENT_HEIGHT=2.5
export const FURNITURE_POLICY={kind:'no-climb',movementHeight:FURNITURE_MOVEMENT_HEIGHT,landing:'slide-out',landingHeightTolerance:.12,exitGap:.03,characterRadiusIncluded:false} as const
export function furnitureMovementBoxes(t:TableAnchor):PhysicalBox[] {
  const vr=t.assetId==='procedural/vr-stone-game-table',scale=tableScale(t)
  const shape=(id:string,x:number,z:number,halfX:number,halfZ:number,yaw=0):PhysicalBox=>({id,center:[x,t.position[1]+FURNITURE_MOVEMENT_HEIGHT/2,z],half:[halfX,FURNITURE_MOVEMENT_HEIGHT/2,halfZ],yaw,role:'solid'})
  const boxes=[shape(t.id+'-top',t.position[0],t.position[2],vr?1.2:t.picnicId?1.1:1.05*scale,vr?.75:t.picnicId?1.1:.8*scale)]
  tableSeats(t).forEach((seat,n)=>boxes.push(shape(t.id+'-chair-'+n,t.position[0]+seat.x,t.position[2]+seat.z,vr?.525:t.picnicId?.325:.36*scale,vr?.45:t.picnicId?.325:.4*scale,seat.yaw)))
  return boxes
}
