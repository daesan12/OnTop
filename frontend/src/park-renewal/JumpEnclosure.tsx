import {PropModel} from '../world/art/PropModel'
import {createJumpFenceArt} from './guardArt'
import {staticPark} from './static/store'
const art=staticPark?.guardArt.jump??createJumpFenceArt()
export function JumpEnclosure(){return <PropModel art={art} name="jump-garden-verge-fence-with-open-south-gate"/>}
