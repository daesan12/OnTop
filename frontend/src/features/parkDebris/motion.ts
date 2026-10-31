import {DEBRIS_COINS,DEBRIS_LAUNCH,type ParkDebris} from './state'

const stoneStarts=[[-.2,.1],[0,.1],[.1,0],[0,-.1],[-.1,-.1]] as const

function random(seed:number,index:number){let v=(seed^Math.imul(index+1,0x45d9f3b))>>>0;v=Math.imul(v^(v>>>16),0x45d9f3b)>>>0;return ((v^(v>>>16))>>>0)/0xffffffff}
export function debrisLanding(item:ParkDebris,index:number) {
  if(index>=DEBRIS_COINS){
    // Stones fan out to either side of the board, keeping each landing clear of its surface.
    const r=1.5+random(item.seed,index+3)*2.1
    const yaw=item.throwYaw+(index%2?1:-1)*(.7+random(item.seed,index+20)*.7)
    return {x:Math.sin(yaw)*r,z:Math.cos(yaw)*r,yaw:random(item.seed,index+40)*Math.PI*2}
  }
  const board=index<0,r=board?2.7:1.65+random(item.seed,index+3)*2.1
  const yaw=item.throwYaw+(board?.1:(random(item.seed,index+20)-.5)*1.8)
  return {x:Math.sin(yaw)*r,z:Math.cos(yaw)*r,yaw:random(item.seed,index+40)*Math.PI*2}
}
/** Deterministic ballistic-looking flight/bounces: everyone samples the same server timestamp.
 * Collision-free scenery only; resting objects never push players or block paths. */
export function debrisPose(item:ParkDebris,index:number,age:number,startY:number,floorY:number) {
  const landing=debrisLanding(item,index),board=index<0,flight=board?1650:1250+random(item.seed,index+60)*450
  if(age>=2750)return {x:landing.x,z:landing.z,y:floorY,rx:0,ry:landing.yaw,rz:0,visible:true,settled:true}
  const t=Math.max(0,Math.min(1,(age-DEBRIS_LAUNCH)/flight)),turn=board?Math.PI*4:Math.PI*(4+2*(index%3))
  const [startX,startZ]=stoneStarts[index-DEBRIS_COINS]??[0,0]
  const bounceAge=Math.max(0,age-DEBRIS_LAUNCH-flight)/1000
  const bounce=t<1?0:Math.max(0,Math.sin(bounceAge*18))*Math.exp(-bounceAge*12)*(board?.08:.16)
  return {x:startX+(landing.x-startX)*t,z:startZ+(landing.z-startZ)*t,
    y:startY+(floorY-startY)*t+Math.sin(t*Math.PI)*(board?1.65:1.9)+bounce,
    rx:-turn*t,ry:landing.yaw*t,rz:Math.sin(t*Math.PI)*.3,visible:age>=DEBRIS_LAUNCH,settled:age>=2750}
}
