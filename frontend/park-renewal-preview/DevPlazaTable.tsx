import {outdoorStoneTableParts} from './original/features/tables/outdoorStoneTableParts.ts'
import {Instances} from '../src/world/art/Instances'
import {SurfaceMaterial} from '../src/world/art/SurfaceMaterial'
import {BeveledBox} from '../src/world/art/BeveledBox'
const parts=outdoorStoneTableParts(2)
export function DevPlazaTable({anchorId}:{anchorId?:string}){return <group name={anchorId??'dev-plaza-stone-game-table'} userData={{assetId:'procedural/stone-game-table',anchorId,presentedSeatCount:2}}>
 <Instances parts={parts.stone} material={<SurfaceMaterial kind="stone" mapping="box" meters={1.25} color="#ffffff"/>}><BeveledBox/></Instances>
 <Instances parts={parts.supports} material={<meshStandardMaterial metalness={.35} roughness={.62}/>}><boxGeometry/></Instances>
 </group>}
