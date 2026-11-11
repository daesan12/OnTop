import {PropModel} from '../src/world/art/PropModel'
import {guardPosts} from './guardLayout'
import {createHillGuardArt} from './guardArt'
export const hillGuardPostPositions=guardPosts
const art=createHillGuardArt()
export function HillsideFinishing(){return <PropModel name="finished-hill-stone-edges-and-timber-guards" art={art}/>}
