import {useMemo} from 'react'
import type {Group} from 'three'
import {useMobility,vehicles,type Vehicle} from '../src/features/mobility/state'
import {rentalLabel} from './rentalAssets.js'
import {createSharedBuildingModels} from './sharedBuildingModels'
import {SITES,facilityGroundY,RENTAL_PAIR_SPACING,rentalYaw} from './plan'

const entranceRentalIds = new Set(['mobility-entry', 'mobility-rest', 'mobility-fitness'])
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
export function RentalPairs({ entrance, batch }: { entrance: boolean; batch?: number }) {
 const shared=getSharedBuildingModels()
 return <>{SITES.filter(s=>s.asset==='pair'&&entranceRentalIds.has(s.id)===entrance)
  .filter((_, index)=>batch === undefined || Math.floor(index / 3) === batch)
  .map(s=><group key={s.id} name={'paired-rental-'+s.id} position={[s.x,facilityGroundY(s)+.1,s.z]} rotation={[0,rentalYaw(s),0]}>{(['BICYCLE','SCOOTER'] as const).map(vehicle=><group key={vehicle} position={[vehicles[vehicle].side*RENTAL_PAIR_SPACING/2,0,0]}><SharedModel source={shared[vehicle==='BICYCLE'?'bike':'scooter']}/><RentalHighlight station={s.id} vehicle={vehicle}/></group>)}</group>)}</>
}
export const distantRentalBatches = Math.ceil(SITES.filter(s=>s.asset==='pair'&&!entranceRentalIds.has(s.id)).length / 3)
