import { useMemo } from 'react'
import { Instances, type Part } from '../src/world/art/Instances'
import { buildingParts } from '../src/world/art/buildingParts'
import { MediaBuilding } from '../src/world/art/MediaBuilding'
import { UrbanMaterial } from '../src/world/art/UrbanMaterials'
import { CITY_BASE_Y } from './contextPlan'
import { CityDetailGeometry } from './ParkDetailGeometry'
import type { CityLayout } from './CityBackdrop'

function buildings(layout: CityLayout){const stone:Part[]=[],glass:Part[]=[],trim:Part[]=[]
 for(const b of layout.blocks){const parts=buildingParts(b);for(const[list,source]of[[stone,parts.stone],[glass,parts.glass],[trim,parts.metal]]as const)for(const p of source){const c=Math.cos(b.yaw),s=Math.sin(b.yaw);list.push({...p,p:[b.x+c*p.p[0]+s*p.p[2],CITY_BASE_Y+p.p[1],b.z-s*p.p[0]+c*p.p[2]],r:[p.r?.[0]??0,b.yaw+(p.r?.[1]??0),p.r?.[2]??0]})}}
 return {stone,glass,trim}
}

export default function CityBuildings({layout}:{layout:CityLayout}) {
 const city=useMemo(()=>buildings(layout),[layout])
 return (
  <group name="reused-city-buildings" userData={{keepOpaque:true}}>
   <Instances parts={city.stone} shadow={false}><boxGeometry/></Instances>
   <Instances parts={city.glass} shadow={false} material={<UrbanMaterial kind="glass"/>}><boxGeometry/></Instances>
   <Instances parts={city.trim} shadow={false}><boxGeometry/></Instances>
   <group position={[0,CITY_BASE_Y,0]}>{layout.media.map(b=><MediaBuilding key={b.id} b={b} advertising={false}/>)}</group>
   <CityDetailGeometry/>
  </group>
 )
}
