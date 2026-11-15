import {site,NODES,LAKE,FACILITY_APPROACHES,facilityGroundY,heightAt,rentalYaw,type Point,type Site} from './plan'
import {aimedYaw} from './assetSizing'
/** Shared rendering/mapping orientation; native model fronts are not all +Z. */
export function facilityYaw(s:Site){
 if(s.id==='tower')return Math.PI
 if(['fitness','fountain','pagoda','jump','plaza'].includes(s.id))return 0
 if(s.id==='island-pavilion')return -Math.PI/2
 const n=NODES[s.node]!
 if(s.asset==='main')return Math.PI
 if(s.asset==='fortune')return aimedYaw('fortune',-s.x,108-s.z)
 if(s.asset==='lottery')return s.yaw!+Math.PI
 if(s.asset==='dock')return 0
 if(s.asset==='pair')return rentalYaw(s)
 if(s.id==='stele'||s.id.startsWith('rest-'))return s.yaw!
 return s.yaw??aimedYaw(s.asset??s.id,n[0]-s.x,n[1]-s.z)
}
export const facilityBase=(id:string)=>{const s=site(id);return s.asset==='dock'?LAKE.y:['tower','fitness','fountain','pagoda','jump','island-pavilion'].includes(id)||id.startsWith('rest-')?heightAt(s.x,s.z):facilityGroundY(s)+.1}

export function frontOfApproach(id: string): Point {
  const { a, b } = FACILITY_APPROACHES.find(approach => approach.id === id)!
  const { x, z } = site(id)
  const dx = a[0] - x, dz = a[1] - z, distance = Math.hypot(dx, dz)
  return [b[0] + dx / distance * 1.3, b[1] + dz / distance * 1.3]
}
