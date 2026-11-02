type Kiosk={x:number;z:number;width:number;depth:number;yaw:number}

/** Reserve the full roof/awning envelope plus the tree's crown, not just its trunk. */
export function inCanopyClearing(x:number,z:number,site:{x:number;z:number},roof:{yaw:number;roofWidth:number;roofDepth:number},padding:number){
  const dx=x-site.x,dz=z-site.z,c=Math.cos(roof.yaw),s=Math.sin(roof.yaw)
  const across=Math.abs(dx*c-dz*s),forward=Math.abs(dx*s+dz*c)
  return Math.hypot(Math.max(0,across-roof.roofWidth/2),Math.max(0,forward-roof.roofDepth/2))<padding
}

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
