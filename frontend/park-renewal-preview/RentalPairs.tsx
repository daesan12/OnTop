import {useMemo} from 'react'
import type {Group} from 'three'
import {useMobility,vehicles,type Vehicle} from '../src/features/mobility/state'
import {rentalLabel} from './rentalAssets.js'
import {createSharedBuildingModels} from './sharedBuildingModels'
import {SITES,facilityGroundY,RENTAL_PAIR_SPACING,rentalYaw} from './plan'

const gateRentalId = 'mobility-entry'
const nearbyRentalIds = new Set(['mobility-rest', 'mobility-fitness'])
const rentalSites = SITES.filter(s => s.asset === 'pair')
const rentalAreas = {
 gate: rentalSites.filter(s => s.id === gateRentalId),
 nearby: rentalSites.filter(s => nearbyRentalIds.has(s.id)),
 distant: rentalSites.filter(s => s.id !== gateRentalId && !nearbyRentalIds.has(s.id)),
}
const rentalTextures={bike:rentalLabel('bicycle'),scooter:rentalLabel('scooter')}
let sharedBuildingModels: ReturnType<typeof createSharedBuildingModels> | undefined
function getSharedBuildingModels() {
 return sharedBuildingModels ??= createSharedBuildingModels(rentalTextures)
}
function SharedModel({source}:{source:Group}){
 const object=useMemo(()=>source.clone(true),[source])
 return <primitive object={object} dispose={null}/>
}
function RentalHighlight({station,vehicle}:{station:string;vehicle:Vehicle}) {
 const selected=useMobility(s=>s.target?.stationId===station&&s.target.vehicle===vehicle)
 return selected ? <mesh rotation={[-Math.PI/2,0,0]} position={[0,.055,0]}>
   <ringGeometry args={[1.64,1.71,4,1,Math.PI/4]}/>
   <meshBasicMaterial color="#eab14d" depthWrite={false}/>
 </mesh> : null
}
export function RentalPairs({ area, batch }: { area: keyof typeof rentalAreas; batch?: number }) {
 const shared=getSharedBuildingModels()
 return <>{rentalAreas[area]
  .filter((_, index)=>batch === undefined || Math.floor(index / 3) === batch)
  .map(s=><group key={s.id} name={'paired-rental-'+s.id} position={[s.x,facilityGroundY(s)+.1,s.z]} rotation={[0,rentalYaw(s),0]}>{(['BICYCLE','SCOOTER'] as const).map(vehicle=><group key={vehicle} position={[vehicles[vehicle].side*RENTAL_PAIR_SPACING/2,0,0]}><SharedModel source={shared[vehicle==='BICYCLE'?'bike':'scooter']}/><RentalHighlight station={s.id} vehicle={vehicle}/></group>)}</group>)}</>
}
export const distantRentalBatches = Math.ceil(rentalAreas.distant.length / 3)
