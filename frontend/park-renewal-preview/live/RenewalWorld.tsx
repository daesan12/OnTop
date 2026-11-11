import { Buildings } from '../Buildings'
import { CityBackdrop } from '../CityBackdrop'
import { ParkDetailGeometry } from '../ParkDetailGeometry'
import { ScenicDetails } from '../ScenicDetails'

export default function RenewalWorld() {
  return <group name="renewal-220-world">
    <CityBackdrop />
    <ScenicDetails />
    <Buildings />
    <ParkDetailGeometry jumpCourse={false} />
  </group>
}
