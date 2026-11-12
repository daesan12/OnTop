import type {Texture} from 'three'
import {factory} from './assetFactories'
import {batchRentalMeshes} from './batchRentalMeshes'

const rentalProfileView=new URLSearchParams(window.location.search).get('rental-profile')

/** Static templates share geometry and materials. Each placement clones its object tree. */
export function createSharedBuildingModels(signs:{bike:Texture;scooter:Texture}){
  const bike=factory('rental-bay',{kind:'bicycle',signTexture:signs.bike})
  const scooter=factory('rental-bay',{kind:'scooter',signTexture:signs.scooter})
  return {
    bike:rentalProfileView==='before'?bike:batchRentalMeshes(bike),
    scooter:rentalProfileView==='before'?scooter:batchRentalMeshes(scooter),
  }
}
