import type {Texture} from 'three'
import {factory} from './assetFactories'
import {groundObject} from './assetSizing'
import {SUB_PAVILION_SCALE} from './plan'

/** Each scene owns its templates. Private object trees share immutable geometry
 * and materials, just as the loaded GLB instances do. No global cache survives
 * a scene unmount; animated boats/animals and seeded trees stay independent. */
export function createSharedBuildingModels(signs:{bike:Texture;scooter:Texture}){
  return {
    bike:factory('rental-bay',{kind:'bicycle',signTexture:signs.bike}),
    scooter:factory('rental-bay',{kind:'scooter',signTexture:signs.scooter}),
    pavilion:groundObject(factory('sub',{scale:SUB_PAVILION_SCALE})),
  }
}
