type Kiosk={x:number;z:number;width:number;depth:number;yaw:number}

/** Reserve the sound box's body, canopy clearance and usable approach together. */
export function inMailboxClearing(x:number,z:number,mailbox:{x:number;z:number},radius:number) {
  return Math.hypot(x-mailbox.x,z-mailbox.z)<radius
}

/** Keep the entire shopfront and the approach clear, including canopy overhang. */
export function inKioskEntrance(x:number,z:number,kiosks:readonly Kiosk[]) {
  return kiosks.some(k=>{
    const dx=x-k.x,dz=z-k.z,c=Math.cos(k.yaw),s=Math.sin(k.yaw)
    const across=dx*c-dz*s,forward=dx*s+dz*c
    return Math.abs(across)<k.width/2+2.3&&forward>k.depth/2-.8&&forward<k.depth/2+9
  })
}
