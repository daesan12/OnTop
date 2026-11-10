import {ScenicDetails} from '../Scene'
import {CityBackdrop} from '../CityBackdrop'
import {Buildings} from '../Buildings'
import {TableShell} from '../../features/tables/TableShell'
import {renewalTables} from './placements'
import {RenewalJumpCourse} from './RenewalJumpCourse'
/** Original game boards and table presentation run on the new scene, without copying game engines. */
export function RenewalWorld(){return <group name="renewal-local-service-world" userData={{keepOpaque:true}}><CityBackdrop/><ScenicDetails/><Buildings live/><RenewalJumpCourse/>{renewalTables.map(anchor=><TableShell key={anchor.id} anchor={anchor} visual={!anchor.pavilionId}/>)}</group>}
