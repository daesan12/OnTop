import { Buildings } from '../Buildings'
import { CityBackdrop } from '../CityBackdrop'
import { ParkDetailGeometry } from '../ParkDetailGeometry'
import { ScenicDetails } from '../ScenicDetails'
import { TableShell } from '../../src/features/tables/TableShell'
import { TABLES } from '../../src/park/mapConfig'

export default function RenewalWorld() {
  return <group name="renewal-220-world">
    <CityBackdrop />
    <ScenicDetails />
    <Buildings live />
    {TABLES.map(anchor => <TableShell key={anchor.id} anchor={anchor} nativeFurniture={!!anchor.pavilionId} />)}
    <ParkDetailGeometry jumpCourse={false} />
  </group>
}
