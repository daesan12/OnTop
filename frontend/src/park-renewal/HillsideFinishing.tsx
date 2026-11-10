import {PropModel} from '../world/art/PropModel'
import {guardPosts} from './guardLayout'
import {createHillGuardArt} from './guardArt'
import {staticPark} from './static/store'
export const hillGuardPostPositions=guardPosts
const art=staticPark?.guardArt.hill??createHillGuardArt()
export function HillsideFinishing(){return <PropModel name="finished-hill-stone-edges-and-timber-guards" art={art}/>}
