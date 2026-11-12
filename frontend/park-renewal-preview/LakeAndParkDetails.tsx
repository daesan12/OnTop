import {useMemo} from 'react'
import {ParkPigeons} from '../src/world/pigeons/ParkPigeons'
import {createBirds} from '../src/world/pigeons/pigeonSimulation'
import {useLivePigeonVisitors} from '../src/world/pigeons/useLivePigeonVisitors'
import {previewCurbs} from './previewCurbs'
import {factory} from './assetFactories'
import {heightAt,insidePark,inLake,LAKE} from './plan'
import {LakeFish} from '../src/world/art/LakeFish'
import {LAKE as ORIGINAL_LAKE} from '../src/config/parkLandforms'
import {LakePart,LakeStage} from './lakeStages'

const centers=[{x:-5,z:39},{x:8,z:40},{x:0,z:52}]
const safe=(p:{x:number;z:number})=>insidePark(p.x,p.z,4)&&!inLake(p.x,p.z,2)
const spawnSites=centers.map(c=>Array.from({length:16},(_,i)=>({x:c.x+(i%4-1.5)*1.3,z:c.z+(Math.floor(i/4)-1.5)*1.3})).filter(safe))
// Keep the initial flock positions. Escape landings need the original behavior's
// 5–12 m flight range; the compact 3.9 m spawn grid provided no route for most birds.
export const renewalPigeonHabitat={visitors:()=>[],sites:centers.map(c=>Array.from({length:16},(_,i)=>({x:c.x+(i%4-1.5)*3,z:c.z+(Math.floor(i/4)-1.5)*3})).filter(safe)),spawn:(i:number)=>createBirds(i,spawnSites[i]!,centers[i]!,heightAt),environment:{groundHeight:heightAt,clearRoute:(a:{x:number;z:number},b:{x:number;z:number})=>Array.from({length:6},(_,i)=>({x:a.x+(b.x-a.x)*i/5,z:a.z+(b.z-a.z)*i/5})).every(p=>insidePark(p.x,p.z,2)&&!inLake(p.x,p.z,1))}}
const structureTemplates = new Map<string, ReturnType<typeof factory>>()
function LakeStructure({ kind }: { kind: 'bridge' | 'bridge-guards' | 'lake-fence' }) {
  const object = useMemo(() => {
    let template = structureTemplates.get(kind)
    if (!template) {
      template = factory(kind)
      structureTemplates.set(kind, template)
    }
    return template.clone(true)
  }, [kind])
  return <primitive object={object} dispose={null}/>
}

export function LakeAndParkDetails({live=false}: {live?: boolean}){
 const visitors=useLivePigeonVisitors()
 const habitat=useMemo(()=>live?{...renewalPigeonHabitat,visitors}:renewalPigeonHabitat,[live,visitors])
 return <>
 <mesh name="continuous-mitered-stone-curbs" geometry={previewCurbs}><meshLambertMaterial color="#beb9a5" side={2}/></mesh>
 <group name="lake-shore-structures">
  <LakePart at={LakeStage.Bridge}><LakeStructure kind="bridge"/><LakeStructure kind="bridge-guards"/></LakePart>
  <LakePart at={LakeStage.Fence}><LakeStructure kind="lake-fence"/></LakePart>
  <LakePart at={LakeStage.Fish}>
   <group name="preserved-lake-fish" position={[LAKE.x-ORIGINAL_LAKE.x*LAKE.rx/ORIGINAL_LAKE.radiusX,LAKE.y,LAKE.z-ORIGINAL_LAKE.z*LAKE.rz/ORIGINAL_LAKE.radiusZ]} scale={[LAKE.rx/ORIGINAL_LAKE.radiusX,1,LAKE.rz/ORIGINAL_LAKE.radiusZ]}><LakeFish quality="high"/></group>
  </LakePart>
 </group>
 <ParkPigeons quality="low" habitat={habitat}/>
</>}
