import { GachaMachine } from './original/features/gacha/parkAsset/GachaMachine'
import { facilityYaw } from './facilityPlacement'
import { legacyIdsForSite } from './mapping/identities'
import { facilityGroundY, site } from './plan'

export function interactWithKiosk(id: string) {
  void import('../src/features/interactions/parkInteraction').then(({ interactWithPark }) => interactWithPark(id))
}

export function ParkGachaKiosk({ live }: { live: boolean }) {
  const kiosk = site('gacha')
  return (
    <group name="facility-gacha" userData={{ siteId: kiosk.id, legacyFacilityIds: legacyIdsForSite(kiosk.id) }}
      position={[kiosk.x, facilityGroundY(kiosk) + .1, kiosk.z]} rotation={[0, facilityYaw(kiosk), 0]}>
      <group userData={{ keepOpaque: true }}>
        <GachaMachine onInteract={live ? () => interactWithKiosk('layout-shop') : undefined} />
      </group>
    </group>
  )
}
