import type {Texture} from 'three'
import {rentalBay} from './rentalAssets.js'
import {batchRentalMeshes} from './batchRentalMeshes'

const rentalProfileView=new URLSearchParams(window.location.search).get('rental-profile')

/** Static templates share geometry and materials. Each placement clones its object tree. */
export function createSharedBuildingModels(signs:{bike:Texture;scooter:Texture}){
  const bike=rentalBay({kind:'bicycle',signTexture:signs.bike})
  const scooter=rentalBay({kind:'scooter',signTexture:signs.scooter})
  return {
    bike:rentalProfileView==='before'?bike:batchRentalMeshes(bike),
    scooter:rentalProfileView==='before'?scooter:batchRentalMeshes(scooter),
  }
}
