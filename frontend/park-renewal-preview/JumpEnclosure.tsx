import {PropModel} from '../src/world/art/PropModel'
import {createJumpFenceArt} from './guardArt'
let art: ReturnType<typeof createJumpFenceArt> | undefined
export function JumpEnclosure(){return <PropModel art={art??=createJumpFenceArt()} name="jump-garden-verge-fence-with-open-south-gate"/>}
