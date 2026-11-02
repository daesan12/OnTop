import { useMemo } from 'react'
import { PAVILION_CLOSED_SIDES,PAVILION_TIMBER } from '../../config/parkPlan'
import { Instances,beam,type Part } from './Instances'
import type { LanternPavilion } from './pavilionLanternLayout'

/** Same six closed bays, radius and world-space height as the exported collision rails. */
export function pavilionRailingParts(p:LanternPavilion) {
  const parts:Part[]=[],radius=3.65*p.scale
  for(const side of PAVILION_CLOSED_SIDES) {
    const a=Math.PI/8+side*Math.PI/4,b=a+Math.PI/4
    const point=(angle:number,y:number):[number,number,number]=>[p.x+Math.cos(angle)*radius,p.floor+y,p.z+Math.sin(angle)*radius]
    for(const y of [.18,.62,PAVILION_TIMBER.railHeight-.055])parts.push(beam(point(a,y),point(b,y),y>.9?.11:.075,'#936f4c'))
    for(let n=1;n<5;n++){
      const t=n/5,x=(Math.cos(a)*(1-t)+Math.cos(b)*t)*radius,z=(Math.sin(a)*(1-t)+Math.sin(b)*t)*radius
      parts.push({p:[p.x+x,p.floor+.67,p.z+z],s:[.065,.98,.065],c:'#ac855c'})
    }
  }
  return parts
}
export function PavilionRailings({pavilion}:{pavilion:LanternPavilion}) {
  const parts=useMemo(()=>pavilionRailingParts(pavilion),[pavilion])
  return <group name={`pavilion-${pavilion.id}-railings`} userData={{closedSides:[...PAVILION_CLOSED_SIDES],height:PAVILION_TIMBER.railHeight}}>
    <Instances parts={parts} shadow={false}><boxGeometry/></Instances>
  </group>
}
