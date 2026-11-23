/** Center the table above the bottom action bar, for each existing seat. */
export function rummikubCameraPose(center: readonly [number,number,number],seatX:number,seatZ:number,scale:number,viewport?:{width:number;height:number}) {
  const yaw=Math.atan2(seatX,seatZ)
  const fit=Math.max(1,.9/Math.max(.25,viewport ? viewport.width/Math.max(1,viewport.height) : 1.5))
  return {
    position:[center[0]+Math.sin(yaw)*1.35*scale*fit,center[1]+1.06+2.15*scale*fit,center[2]+Math.cos(yaw)*1.35*scale*fit] as [number,number,number],
    target:[center[0],center[1]+1.1,center[2]] as [number,number,number],
  }
}
