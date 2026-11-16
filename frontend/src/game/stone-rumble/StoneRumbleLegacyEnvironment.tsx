import { GARDEN_PAGODA } from '../../config'
import { PreviewWorld } from '../../layout-preview/PreviewWorld'
import { PARK_LAYOUT } from '../../map/park'
import { ServiceJumpCourse } from '../../features/jumpmap/ServiceJumpCourse'

const pagoda = PARK_LAYOUT.SITES.pagoda
const arenaBaseY = pagoda.floor + GARDEN_PAGODA.height + 8

export default function StoneRumbleLegacyEnvironment() {
  return <group name="stone-rumble-park" rotation={[0, Math.PI, 0]}>
    <group position={[-pagoda.x, -arenaBaseY, -pagoda.z]}>
      <PreviewWorld live />
      <ServiceJumpCourse />
    </group>
  </group>
}
