import {site,heightAt,facilityGroundY,REST_PAVILIONS,SUB_PAVILION_SCALE,LAKE,MONUMENT_STAIRS,BRIDGE,bridgeDeckHeight,type Point} from './plan'
import {MOVEMENT} from '../config'

export interface WalkPatch {id:string;outline:Point[];height:(x:number,z:number)=>number}
const mix=(a:number,b:number,t:number)=>a+(b-a)*Math.max(0,Math.min(1,t))
/** A round capsule touches a slope ahead of its centre. The displayed origin
 * must include that tangent clearance, instead of penetrating the arched deck. */
export function bridgeWalkHeight(x:number){
 const length=BRIDGE.x1-BRIDGE.x0,t=Math.max(0,Math.min(1,(x-BRIDGE.x0)/length)),slope=(-.4+BRIDGE.rise*4*(1-2*t))/length
 return bridgeDeckHeight(x)+MOVEMENT.radius*(Math.sqrt(1+slope*slope)-1)
}
export const localPoint=(x:number,z:number,cx:number,cz:number,yaw=0):Point=>[cx+Math.cos(yaw)*x+Math.sin(yaw)*z,cz-Math.sin(yaw)*x+Math.cos(yaw)*z]
export function containsOutline(points:readonly Point[],x:number,z:number){
 let positive=false,negative=false
 for(let i=0;i<points.length;i++){const a=points[i]!,b=points[(i+1)%points.length]!,cross=(b[0]-a[0])*(z-a[1])-(b[1]-a[1])*(x-a[0]);positive ||= cross>1e-7;negative ||= cross< -1e-7}
 return !(positive&&negative)
}
const octagon=(x:number,z:number,r:number,yaw=0)=>Array.from({length:8},(_,i)=>localPoint(Math.sin((i+.5)*Math.PI/4)*r,Math.cos((i+.5)*Math.PI/4)*r,x,z,yaw))
const rectangle=(x:number,z:number,half:number,inner:number,outer:number,yaw=0)=>[[-half,inner],[half,inner],[half,outer],[-half,outer]].map(([a,b])=>localPoint(a!,b!,x,z,yaw))
let patches:WalkPatch[]|undefined
/** Smooth capsule support follows the visible tread envelope. Source meshes and
 * stair dimensions are untouched; this same data builds server support meshes. */
export function accessWalkPatches():readonly WalkPatch[]{
 if(patches)return patches
 const result:WalkPatch[]=[]
 const flat=(id:string,outline:Point[],y:number)=>result.push({id,outline,height:()=>y})
 const ramp=(id:string,x:number,z:number,half:number,inner:number,outer:number,top:number,bottom:number,yaw=0)=>{
  result.push({id,outline:rectangle(x,z,half,inner,outer,yaw),height:(px,pz)=>mix(top,bottom,((px-x)*Math.sin(yaw)+(pz-z)*Math.cos(yaw)-inner)/(outer-inner))})
 }
 const main=site('pavilion'),base=facilityGroundY(main)+.115
 // Measured native GLB: ground min=-.015, floor=2.6, upper octagon R=9.52.
 flat('renewal-main-floor',octagon(main.x,main.z,9.52),base+2.6)
 flat('renewal-main-lower-terrace',octagon(main.x,main.z,12.12),base+1.3)
 for(let side=0;side<4;side++){
  const yaw=side*Math.PI/2,half=side===0?2.18698:1.48698
  flat('renewal-main-landing-'+side,rectangle(main.x,main.z,half,8.68,9.02627,yaw),base+2.6)
  ramp('renewal-main-stairs-'+side,main.x,main.z,half,9.02627,13.60647,base+2.6,base,yaw)
 }
 for(const [i,[x,z]]of [...REST_PAVILIONS,[LAKE.island.x,LAKE.island.z]as Point].entries()){
  const yaw=i<REST_PAVILIONS.length?site('rest-'+(i+1)).yaw!:-Math.PI/2,base=heightAt(x,z),unit=1.1*SUB_PAVILION_SCALE,top=base+.572*unit
  flat('renewal-sub-floor-'+i,octagon(x,z,2.9*unit,yaw),top)
  ramp('renewal-sub-stairs-'+i,x,z,.76*unit,2.67*unit,3.77*unit,top,base+.085,yaw)
 }
 const pagoda=site('pagoda'),pg=heightAt(pagoda.x,pagoda.z)
 flat('renewal-pagoda-terrace',rectangle(pagoda.x,pagoda.z,13,-13,13),pg+1.8)
 for(let side=0;side<4;side++)ramp('renewal-pagoda-stairs-'+side,pagoda.x,pagoda.z,3,13,17,pg+1.8,pg+.085,side*Math.PI/2)
 const s=MONUMENT_STAIRS
 ramp('renewal-monument-stairs',s.x,0,s.width/2,s.zTop,s.zBottom,s.top+.085,s.bottom+.085)
 patches=result;return result
}
export function accessSurfaceHeight(x:number,z:number){
 let y=-Infinity
 for(const patch of accessWalkPatches())if(containsOutline(patch.outline,x,z))y=Math.max(y,patch.height(x,z))
 return Number.isFinite(y)?y:null
}
