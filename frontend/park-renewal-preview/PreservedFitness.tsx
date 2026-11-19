import {FitnessGarden} from '../src/world/art/FitnessGarden'
import {FitnessCourtPaving} from '../src/world/art/FitnessCourtPaving'
import {PropModel} from '../src/world/art/PropModel'
import {FacetedParkTreeInstances} from '../src/world/art/FacetedParkTreeInstances'
import {buildParkTreeParts} from '../src/world/art/parkTreeParts'
import {DRAFT_FITNESS_AREA,DRAFT_FITNESS_STATIONS,SITES as ORIGINAL_SITES} from '../src/layout-preview/layout'
import {fitnessRestArt} from '../src/layout-preview/districtGeometry'
import {site,heightAt} from './plan'
import {WINTER_TREES_ENABLED,winterTreeParts} from '../src/features/winter/trees'
import {TreeSnowCaps} from '../src/features/winter/TreeSnowCaps'
import type {TreePlanting} from '../src/world/art/parkTreeParts'

import {renderedFitnessTrees} from './fitnessTreesPlan'
export {originalFitnessTrees,renderedFitnessTrees} from './fitnessTreesPlan'
const seasonalTrees=(plantings:readonly TreePlanting[])=>{
 const parts=buildParkTreeParts(plantings)
 return WINTER_TREES_ENABLED?winterTreeParts(parts,plantings):parts
}
const grove=seasonalTrees(renderedFitnessTrees)
const center=seasonalTrees([{position:[ORIGINAL_SITES.fitness.x,.1,ORIGINAL_SITES.fitness.z],kind:'broadleaf',scale:1.45}])
const noStations: typeof DRAFT_FITNESS_STATIONS = []
export function PreservedFitness({showStations=true}: {showStations?: boolean} = {}){const s=site('fitness');return <group name="preserved-complete-fitness-district" position={[s.x-ORIGINAL_SITES.fitness.x,heightAt(s.x,s.z),s.z-ORIGINAL_SITES.fitness.z]}>
 <FitnessGarden area={DRAFT_FITNESS_AREA} stations={showStations?DRAFT_FITNESS_STATIONS:noStations} floorShape="ellipse" showPads={false} floorColor="#c8c0ad"/>
 <group position={[0,.012,0]}><FitnessCourtPaving area={DRAFT_FITNESS_AREA} color="#c8c0ad"/></group>
 <PropModel art={fitnessRestArt} name="preserved-fitness-ring-benches"/>
 <FacetedParkTreeInstances parts={center} name="preserved-fitness-center-tree" treeCount={1}/>
 <TreeSnowCaps parts={center}/>
 <FacetedParkTreeInstances parts={grove} name="preserved-fitness-surrounding-trees" treeCount={renderedFitnessTrees.length}/>
 <TreeSnowCaps parts={grove}/>
 </group>}
