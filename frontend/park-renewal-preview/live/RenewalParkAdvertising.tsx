import { ParkAFrameAdvertisements } from '../../src/world/art/ParkAdvertising'
import { groundSurfaceHeight } from '../groundSurface'
import { renewalAdSigns } from './advertisingPlacement'

const sites = renewalAdSigns.map(site => ({ ...site, y: groundSurfaceHeight(site.x, site.z) }))

export function RenewalParkAdvertising() {
  return (
    <group name="renewal-park-advertising">
      <ParkAFrameAdvertisements sites={sites} />
    </group>
  )
}
