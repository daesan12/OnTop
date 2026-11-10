import {SITES as ORIGINAL} from '../layout-preview/layout'
import {fountainPavingHeight,fountainPavingRadius} from '../layout-preview/fountainPaving'

/** Only the two entrance sectors are regraded; the preserved basin and bench ring stay fixed. */
export function fountainAccessHeight(dx:number,dz:number){
 const r=Math.hypot(dx,dz),old=fountainPavingHeight(ORIGINAL.fountain.x+dx,ORIGINAL.fountain.z+dz)
 if(r<=12||r>=fountainPavingRadius)return old
 const angle=Math.atan2(dz,dx),gate=Math.atan2(-7.19,-17.37)
 const difference=(a:number)=>Math.abs(Math.atan2(Math.sin(angle-a),Math.cos(angle-a)))
 const distance=Math.min(difference(gate),difference(gate+Math.PI))
 if(distance>=.32)return old
 const smooth=(t:number)=>t*t*(3-2*t),weight=1-smooth(Math.max(0,(distance-.18)/.14))
 const inner=fountainPavingHeight(ORIGINAL.fountain.x+dx/r*12,ORIGINAL.fountain.z+dz/r*12)
 const ramp=inner+(.085-inner)*smooth((r-12)/(fountainPavingRadius-12))
 return old+(ramp-old)*weight
}
