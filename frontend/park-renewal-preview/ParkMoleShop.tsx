import { Suspense, useMemo } from 'react'
import { PropModel } from '../src/world/art/PropModel'
import { PropSign } from '../src/world/art/CraftedProp'
import { drawMoleShopSign } from './approved/mole-shop-20261107-v1/core/frontend/src/world/art/moleShopGeometry'
import { FacilityGeometry } from './FacilityGeometry'
import { facilityYaw } from './facilityPlacement'
import { legacyIdsForSite } from './mapping/identities'
import { getMoleShopArt, MOLE_SHOP_FACILITY } from './moleShopArt'
import { originalFacilityGeometry } from './modelUrls'
import { facilityGroundY, site } from './plan'
import { VerticalMoleAttract } from './VerticalMoleAttract'

export function ParkMoleShop({ optimizedReady }: { optimizedReady: boolean }) {
  const shop = site('mole')
  const art = useMemo(getMoleShopArt, [])
  return (
    <group name="facility-mole" userData={{ siteId: shop.id, legacyFacilityIds: legacyIdsForSite(shop.id) }}
      position={[shop.x, facilityGroundY(shop) + .1, shop.z]} rotation={[0, facilityYaw(shop), 0]}>
      <PropModel art={art.body} name="approved-mole-body" />
      <PropModel art={art.roof} name="approved-mole-roof" />
      <PropModel art={art.walls} name="approved-mole-walls" />
      <PropSign draw={drawMoleShopSign} position={[0, 4.4, 3.7]} width={3.1} height={.55} />
      <VerticalMoleAttract facility={MOLE_SHOP_FACILITY} />
      {optimizedReady && !originalFacilityGeometry && (
        <Suspense fallback={null}><FacilityGeometry id="mole" /></Suspense>
      )}
    </group>
  )
}
