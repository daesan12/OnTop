import {useMemo} from 'react'
import type {Group} from 'three'
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
export function RentalPairs({ entrance, batch }: { entrance: boolean; batch?: number }) {
 const shared=getSharedBuildingModels()
 return <>{SITES.filter(s=>s.asset==='pair'&&entranceRentalIds.has(s.id)===entrance)
  .filter((_, index)=>batch === undefined || Math.floor(index / 3) === batch)
  .map(s=><group key={s.id} name={'paired-rental-'+s.id} position={[s.x,facilityGroundY(s)+.1,s.z]} rotation={[0,rentalYaw(s),0]}>{[-1,1].map((side,i)=><group key={side} position={[side*RENTAL_PAIR_SPACING/2,0,0]}><SharedModel source={shared[i===0?'bike':'scooter']}/></group>)}</group>)}</>
}
export const distantRentalBatches = Math.ceil(SITES.filter(s=>s.asset==='pair'&&!entranceRentalIds.has(s.id)).length / 3)
