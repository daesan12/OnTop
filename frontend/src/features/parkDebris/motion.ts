import {DEBRIS_COINS,DEBRIS_LAUNCH,DEBRIS_SETTLE,debrisVisible,type ParkDebris} from './state'

/** window·matchMedia가 없으면 null. MediaQueryList.matches는 브라우저가 실시간으로 갱신하므로
 * 매 프레임 읽으면 실행 중 동작 줄이기 변경도 바로 반영되고, 따로 구독·해제할 리스너도 없다. */
export function reducedMotionQuery():MediaQueryList|null {
  return typeof window!=='undefined'&&typeof window.matchMedia==='function'?window.matchMedia('(prefers-reduced-motion: reduce)'):null
}
/** 잔해가 이 테이블의 게임판을 가리는지. 동작 줄이기에서는 잔해가 처음부터 바닥에 놓이므로 바로 가리고,
 * 발사 전에 설정이 다시 꺼져도(잔해는 이미 안착 상태로 고정) 판이 두 개로 보이지 않게 그 잔해에 대해서는 계속 가린다. */
export function debrisHidesSurface(item:ParkDebris,now:number,reduced:boolean,latched:Set<string>) {
  if(!debrisVisible(item,now)){latched.delete(item.id);return false}
  if(now-Date.parse(item.occurredAt)>=DEBRIS_LAUNCH){latched.delete(item.id);return true}
  if(reduced)latched.add(item.id)
  return latched.has(item.id)
}

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
  const yaw=item.throwYaw+(board?0:(random(item.seed,index+20)-.5)*1.8)
  return {x:Math.sin(yaw)*r,z:Math.cos(yaw)*r,yaw:random(item.seed,index+40)*Math.PI*2}
}
/** Deterministic ballistic-looking flight/bounces: everyone samples the same server timestamp.
 * Collision-free scenery only; resting objects never push players or block paths. */
export function debrisPose(item:ParkDebris,index:number,age:number,startY:number,floorY:number) {
  const landing=debrisLanding(item,index),board=index<0,flight=board?1650:1250+random(item.seed,index+60)*450
  if(age>=DEBRIS_SETTLE)return {x:landing.x,z:landing.z,y:floorY,rx:0,ry:landing.yaw,rz:0,visible:true,settled:true}
  const card = item.gameCode==='ONE_CARD'&&index>=DEBRIS_COINS,cardIndex=index-DEBRIS_COINS
  const launch=DEBRIS_LAUNCH+(card?cardIndex*18:0)
  const t=Math.max(0,Math.min(1,(age-launch)/flight)),turn=board?Math.PI*4:Math.PI*(4+2*(index%3))
  const [startX,startZ]=card?[cardIndex%2?.62:-.62,(Math.floor(cardIndex/2)-3)*.055]:stoneStarts[index-DEBRIS_COINS]??[0,0]
  const bounceAge=Math.max(0,age-launch-flight)/1000
  const bounce=t<1?0:Math.max(0,Math.sin(bounceAge*18))*Math.exp(-bounceAge*12)*(board?.08:.16)
  return {x:startX+(landing.x-startX)*t,z:startZ+(landing.z-startZ)*t,
    y:startY+(floorY-startY)*t+Math.sin(t*Math.PI)*(board?1.65:1.9)+bounce,
    rx:-turn*t,ry:landing.yaw*t,rz:Math.sin(t*Math.PI)*.3,visible:age>=launch,settled:age>=DEBRIS_SETTLE}
}
