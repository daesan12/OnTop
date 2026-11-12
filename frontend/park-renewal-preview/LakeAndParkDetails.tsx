import {useMemo} from 'react'
import {ParkPigeons} from '../src/world/pigeons/ParkPigeons'
import {createBirds} from '../src/world/pigeons/pigeonSimulation'
import {previewCurbs} from './previewCurbs'
import {factory} from './assetFactories'
import {heightAt,insidePark,inLake,LAKE} from './plan'
import {LakeFish} from '../src/world/art/LakeFish'
import {LAKE as ORIGINAL_LAKE} from '../src/config/parkLandforms'

const centers=[{x:-5,z:39},{x:8,z:40},{x:0,z:52}]
const safe=(p:{x:number;z:number})=>insidePark(p.x,p.z,4)&&!inLake(p.x,p.z,2)
const spawnSites=centers.map(c=>Array.from({length:16},(_,i)=>({x:c.x+(i%4-1.5)*1.3,z:c.z+(Math.floor(i/4)-1.5)*1.3})).filter(safe))
// Keep the initial flock positions. Escape landings need the original behavior's
// 5–12 m flight range; the compact 3.9 m spawn grid provided no route for most birds.
export const renewalPigeonHabitat={visitors:()=>[],sites:centers.map(c=>Array.from({length:16},(_,i)=>({x:c.x+(i%4-1.5)*3,z:c.z+(Math.floor(i/4)-1.5)*3})).filter(safe)),spawn:(i:number)=>createBirds(i,spawnSites[i]!,centers[i]!,heightAt),environment:{groundHeight:heightAt,clearRoute:(a:{x:number;z:number},b:{x:number;z:number})=>Array.from({length:6},(_,i)=>({x:a.x+(b.x-a.x)*i/5,z:a.z+(b.z-a.z)*i/5})).every(p=>insidePark(p.x,p.z,2)&&!inLake(p.x,p.z,1))}}
let lakeStructures: { bridge: ReturnType<typeof factory>; fence: ReturnType<typeof factory> } | undefined
function cloneLakeStructures() {
  lakeStructures ??= { bridge: factory('bridge'), fence: factory('lake-fence') }
  // Each mounted scene owns its nodes. Only the static geometry and materials are shared.
  return { bridge: lakeStructures.bridge.clone(true), fence: lakeStructures.fence.clone(true) }
}
export function LakeAndParkDetails(){const {bridge,fence}=useMemo(cloneLakeStructures,[]);return <>
 <mesh name="continuous-mitered-stone-curbs" geometry={previewCurbs}><meshLambertMaterial color="#beb9a5" side={2}/></mesh>
 <primitive object={bridge} dispose={null}/><primitive object={fence} dispose={null}/>
 <group name="preserved-lake-fish" position={[LAKE.x-ORIGINAL_LAKE.x*LAKE.rx/ORIGINAL_LAKE.radiusX,LAKE.y,LAKE.z-ORIGINAL_LAKE.z*LAKE.rz/ORIGINAL_LAKE.radiusZ]} scale={[LAKE.rx/ORIGINAL_LAKE.radiusX,1,LAKE.rz/ORIGINAL_LAKE.radiusZ]}><LakeFish quality="high"/></group>
 <ParkPigeons quality="low" habitat={renewalPigeonHabitat}/>
 </>}
