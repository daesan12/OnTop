import {PropModel} from '../src/world/art/PropModel'
import {createJumpFenceArt} from './guardArt'
const art=createJumpFenceArt()
export function JumpEnclosure(){return <PropModel art={art} name="jump-garden-verge-fence-with-open-south-gate"/>}
