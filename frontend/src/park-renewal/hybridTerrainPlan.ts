export type TerrainPoint=readonly [number,number]
export const SUMMIT_HEIGHT=22
/** Two joined rectangular gardens; every retaining edge stays axis aligned. */
export const SUMMIT_OUTLINE:readonly TerrainPoint[]=[[-58,-94],[-26,-94],[-26,-105],[26,-105],[26,-48],[-58,-48]]
export function inSummit(x:number,z:number){return x>=-26&&x<=26&&z>=-105&&z<=-48||x>=-58&&x<=-26&&z>=-94&&z<=-48}
export function onSummitEdge(x:number,z:number,margin=.5){return SUMMIT_OUTLINE.some((p,i)=>{const q=SUMMIT_OUTLINE[(i+1)%SUMMIT_OUTLINE.length]!,dx=q[0]-p[0],dz=q[1]-p[1],t=Math.max(0,Math.min(1,((x-p[0])*dx+(z-p[1])*dz)/(dx*dx+dz*dz)));return Math.hypot(x-p[0]-dx*t,z-p[1]-dz*t)<margin})}
export function forestBaseHeight(x:number,z:number){const t=Math.max(0,Math.min(1,(z+104)/30)),fade=t*t*(3-2*t);return 4+(9.5*Math.exp(-((x+40)**2/3300+(z+73)**2/2300))+3.5*Math.exp(-(x*x/2300+(z+80)**2/1900)))*fade+3*Math.exp(-((x+67)**2/700+(z+93)**2/400))}
export function constraintWeight(distance:number,reach=18){if(distance>=reach)return 0;const t=Math.max(0,distance/reach),fade=1-t*t*(3-2*t);return fade/Math.max(.02,distance)**2}
