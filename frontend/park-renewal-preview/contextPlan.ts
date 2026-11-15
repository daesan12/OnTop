import {parkRadius,PARK} from './plan.ts'

export const CITY_BASE_Y=3.9
export const STREET={innerWalk:[3,9],road:[9,23],outerWalk:[23,30],buildingSetback:52} as const
/** Same organic boundary as the playable park; all offsets are metres. */
export function boundaryFrame(angle:number,offset=0){
 const sample=(a:number)=>{const r=parkRadius(a);return {x:PARK.rx*r*Math.cos(a),z:PARK.rz*r*Math.sin(a)}}
 const p=sample(angle),before=sample(angle-.0001),after=sample(angle+.0001),dx=after.x-before.x,dz=after.z-before.z,length=Math.hypot(dx,dz),nx=dz/length,nz=-dx/length
 return {x:p.x+nx*offset,z:p.z+nz*offset,nx,nz,yaw:Math.atan2(-nx,-nz)}
}
/** Relocate the original street props; preserve their dimensions and materials. */
export function streetPropFrame(x:number,z:number){
 const angle=Math.atan2(z,x),oldRadius=90/Math.max(Math.abs(Math.cos(angle)),Math.abs(Math.sin(angle))),distance=Math.hypot(x,z)-oldRadius
 return boundaryFrame(angle,distance+4.7)
}
export const CITY_BUILDINGS=Array.from({length:4},(_,side)=>Array.from({length:5},(_,i)=>{
 const yaw=side*Math.PI/2,along=(i-2)*33,depth=-122-(i%2)*16,x=Math.cos(yaw)*along+Math.sin(yaw)*depth,z=-Math.sin(yaw)*along+Math.cos(yaw)*depth,angle=Math.atan2(z,x)
 return {id:`city-${side}-${i}`,side,index:i,angle,w:24,h:24+(i%4)*8,d:18,variant:i+side,...boundaryFrame(angle,STREET.buildingSetback+(i%2)*15)}
})).flat().filter(b=>!(b.side===2&&b.index===2))
export interface CityFootprint {x:number;z:number;w:number;d:number;yaw:number}
export function overlapsBuilding(a:CityFootprint,b:CityFootprint,gap=8){
 const axis=(yaw:number)=>[[Math.cos(yaw),-Math.sin(yaw)],[Math.sin(yaw),Math.cos(yaw)]] as const
 const aa=axis(a.yaw),bb=axis(b.yaw),dx=b.x-a.x,dz=b.z-a.z
 return [...aa,...bb].every(([x,z])=>{const project=(p:CityFootprint,axes:ReturnType<typeof axis>)=>Math.abs(x*axes[0][0]+z*axes[0][1])*(p.w/2+1.5)+Math.abs(x*axes[1][0]+z*axes[1][1])*(p.d/2+2.3);return Math.abs(dx*x+dz*z)<project(a,aa)+project(b,bb)+gap})
}
export function layoutContextBuildings<T extends CityFootprint>(originalMedia:readonly T[]){
 const media=originalMedia.map(b=>{const frame=boundaryFrame(Math.atan2(b.z,b.x),STREET.buildingSetback+b.d/2+6);return {...b,x:frame.x,z:frame.z,yaw:frame.yaw}})
 const blocks:typeof CITY_BUILDINGS=[]
 for(const source of CITY_BUILDINGS){let block={...source};let offset=STREET.buildingSetback+(source.index%2)*15
  while([...media,...blocks].some(b=>overlapsBuilding(block,b))){offset+=38;block={...source,...boundaryFrame(source.angle,offset)};if(offset>400)throw new Error('도시 건물 사이 여유를 확보할 수 없습니다.')}
  blocks.push(block)
 }
 return {blocks,media}
}
