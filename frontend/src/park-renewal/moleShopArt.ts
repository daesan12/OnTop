import type {RecreationFacility} from '../map/park/recreation'
import {buildMoleShop} from './approved/mole-shop-20261107-v1/core/frontend/src/world/art/moleShopGeometry'
import {staticPark,type MoleShopArt} from './static/store'

export const MOLE_SHOP_FACILITY:RecreationFacility={id:'renewal-mole',kind:'mole',label:'두더지 잡기',x:0,z:0,width:10,depth:7,height:6.4,yaw:0,doorWidth:4}

/** Keep the approved CPU builder as the source for builds and offline fallback.
 * Only these visible meshes are static; sign drawing and animation stay live. */
export function createMoleShopArt():MoleShopArt {
  const {body,roof,walls}=buildMoleShop({...MOLE_SHOP_FACILITY})
  return {body,roof,walls}
}

export function getMoleShopArt():MoleShopArt {
  const baked=staticPark?.buildingArt?.mole
  if(baked){performance.mark('park-static-mole-ready');return baked}
  performance.mark('park-procedural-mole-start')
  const art=createMoleShopArt()
  performance.mark('park-procedural-mole-ready')
  return art
}
