import {DynamicDrawUsage,type BufferAttribute,type BufferGeometry} from 'three'
import {smooth} from './gachaMixTiming'

export const LEVER_PIVOT_Y=1.43*1.12
/** Pull down, briefly hold while mixing starts, then spring back without a full spin. */
export function leverPullAngle(age:number){
 if(age<=0||age>=1000)return 0
 const pull=age<330?smooth(age/330):age<600?1:1-smooth((age-600)/400)
 return -Math.PI*7/12*pull
}

/** Move only the lever vertices inside the existing gold batch: no extra mesh/draw call. */
export function createLeverDriver(geometry:BufferGeometry){
 const {start,count}=geometry.userData.leverRange as {start:number;count:number}
 const position=geometry.getAttribute('position') as BufferAttribute,normal=geometry.getAttribute('normal') as BufferAttribute
 const offset=start*3,length=count*3,basePosition=position.array.slice(offset,offset+length),baseNormal=normal.array.slice(offset,offset+length)
 position.setUsage(DynamicDrawUsage);normal.setUsage(DynamicDrawUsage)
 let previous=0
 return (angle:number)=>{
  if(angle===previous)return false
  const c=Math.cos(angle),s=Math.sin(angle)
  for(let i=0;i<length;i+=3){
   const x=basePosition[i]!,y=basePosition[i+1]!-LEVER_PIVOT_Y,nx=baseNormal[i]!,ny=baseNormal[i+1]!
   position.array[offset+i]=angle===0?x:x*c-y*s
   position.array[offset+i+1]=angle===0?basePosition[i+1]!:LEVER_PIVOT_Y+x*s+y*c
   normal.array[offset+i]=angle===0?nx:nx*c-ny*s
   normal.array[offset+i+1]=angle===0?ny:nx*s+ny*c
  }
  for(const attribute of [position,normal]){attribute.clearUpdateRanges();attribute.addUpdateRange(offset,length);attribute.needsUpdate=true}
  previous=angle;geometry.userData.leverAngle=angle
  return true
 }
}
