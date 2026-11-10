import {FitnessGarden} from '../world/art/FitnessGarden'
import {PropModel} from '../world/art/PropModel'
import {FacetedParkTreeInstances} from '../world/art/FacetedParkTreeInstances'
import {buildParkTreeParts} from '../world/art/parkTreeParts'
import {DRAFT_FITNESS_AREA,DRAFT_FITNESS_STATIONS,SITES as ORIGINAL_SITES} from '../layout-preview/layout'
import {fitnessRestArt} from '../layout-preview/districtGeometry'
import {site,heightAt} from './plan'

import {renderedFitnessTrees} from './fitnessTreesPlan'
export {originalFitnessTrees,renderedFitnessTrees} from './fitnessTreesPlan'
const grove=buildParkTreeParts(renderedFitnessTrees)
const center=buildParkTreeParts([{position:[ORIGINAL_SITES.fitness.x,.1,ORIGINAL_SITES.fitness.z],kind:'broadleaf',scale:1.45}])
export function PreservedFitness(){const s=site('fitness');return <group name="preserved-complete-fitness-district" position={[s.x-ORIGINAL_SITES.fitness.x,heightAt(s.x,s.z),s.z-ORIGINAL_SITES.fitness.z]}>
 <FitnessGarden area={DRAFT_FITNESS_AREA} stations={DRAFT_FITNESS_STATIONS} floorShape="ellipse" showPads={false} floorColor="#c8c0ad"/>
 <PropModel art={fitnessRestArt} name="preserved-fitness-ring-benches"/>
 <FacetedParkTreeInstances parts={center} name="preserved-fitness-center-tree" treeCount={1}/>
 <FacetedParkTreeInstances parts={grove} name="preserved-fitness-surrounding-trees" treeCount={renderedFitnessTrees.length}/>
 </group>}
