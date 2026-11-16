import {HORROR_PORTALS} from './horrorPlan.ts'
import {cafeApproachDistance} from './cafeApproach.ts'
/** Terrain-only finishing. Facility, seat, game and interaction anchors stay fixed. */
export const RETAINING_FOOTING_Y=2.5
export const WEST_MEADOW_ISLAND={x:-51.4,z:61.5,rx:3.4,rz:2.35}

/** Keep the hidden outlet floor, with a soil transition instead of a sharp rectangular cut. */
export function hiddenOutletApronHeight(x:number,z:number,height:number){
 const p=HORROR_PORTALS[1],dx=Math.max(p.x-3.6-x,0,x-p.x),dz=Math.max(0,Math.abs(z-p.z)-p.width/2-.2),distance=Math.hypot(dx,dz)
 if(distance>=7)return height
 const t=distance/7,weight=1-t*t*(3-2*t)
 return height+(p.floor-.085-height)*weight
}

export function plantingRevision(x:number,z:number):boolean|undefined {
 if(x>-61&&x<-44&&z>56&&z<70){
  const p=WEST_MEADOW_ISLAND
  return ((x-p.x)/p.rx)**2+((z-p.z)/p.rz)**2<1
 }
 // Align the upper lawn with the lower verge and retain a generous fountain junction.
 if(x>22.4&&x<29&&z>53&&z<65)return false
 return undefined
}

export function cafeApronHeight(x:number,z:number,height:number,centre:{x:number;z:number;ground:number}) {
 const box=Math.max(Math.abs(x-centre.x)-7.2,Math.abs(z-centre.z)-5.4)
 const approach=cafeApproachDistance(x-centre.x,z-centre.z)-2.8
 const distance=Math.min(box,approach),t=Math.max(0,Math.min(1,distance/6)),blend=t*t*(3-2*t)
 let h=centre.ground+(height-centre.ground)*blend
 if(box<=0)return centre.ground
 // A single broad grade also joins the cafe forecourt to the northbound bank road.
 const ax=centre.x+12,az=centre.z+18,dx=1,dz=-12,q=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz))),d=Math.hypot(x-ax-dx*q,z-az-dz*q),w=1-Math.max(0,Math.min(1,(d-3.9)/3))**2*(3-2*Math.max(0,Math.min(1,(d-3.9)/3)))
 const target=centre.ground+.4*q*q*(3-2*q)
 const bw=Math.max(0,Math.min(1,box/5));h+=(target-h)*w*bw*bw*(3-2*bw)
 return h
}
