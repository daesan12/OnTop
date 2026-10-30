import type {PARK_DATA} from '../map/park'

/** Never allow standing on the invisible movement column, including after a
 * high fall or recovery inside the basin. The server must apply the same rule.
 */
export function fountainExclusionPosition(p:{x:number;y:number;z:number},f:typeof PARK_DATA.physics.fountainPolicy,footOffset:number,radius:number){
 if(p.y-footOffset>f.top+.12||p.y+footOffset<f.bottom)return p
 const dx=p.x-f.x,dz=p.z-f.z,distance=Math.hypot(dx,dz),limit=f.radius+radius+f.exitGap
 if(distance>=limit)return p
 const nx=distance>1e-8?dx/distance:0,nz=distance>1e-8?dz/distance:1
 return {...p,x:f.x+nx*limit,z:f.z+nz*limit}
}
