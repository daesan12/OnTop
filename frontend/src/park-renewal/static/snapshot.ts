import {getForestField} from '../plan'
import {getPlantingField} from '../groundPlan'
import {parkGround} from '../groundGeometry'
import {groundIndex} from '../groundSurface'
import {curbPaths,curbGeometry} from '../curbGeometry'
import {hillEdgeSections} from '../hillEdgesPlan'
import {guardRuns,guardPosts,guardPostRailBases} from '../guardLayout'
import {jumpFenceRuns,jumpFenceSections} from '../jumpFencePlan'
import {createHillGuardArt,createJumpFenceArt} from '../guardArt'
import {staticPark} from './store'
import {createMoleShopArt} from '../moleShopArt'
import {createOutdoorReflectionSnapshot,createGachaReflectionSnapshot} from './outdoorReflectionSnapshot'
import type {StaticPark} from './store'

/** Build-time entry. Uses the same builders as authoring and backend exports. */
export const snapshot:StaticPark={
  forestField:getForestField(),plantingField:getPlantingField(),ground:parkGround,groundIndex,
  curbs:{paths:curbPaths,geometry:curbGeometry},hillEdges:hillEdgeSections,
  guards:{guardRuns,guardPosts,guardPostRailBases},jumpFence:{runs:jumpFenceRuns,sections:jumpFenceSections},
  guardArt:staticPark?.guardArt??{hill:createHillGuardArt(),jump:createJumpFenceArt()},
  buildingArt:{mole:staticPark?.buildingArt?.mole??createMoleShopArt()},
  outdoorReflection:staticPark?.outdoorReflection??createOutdoorReflectionSnapshot(),
  gachaReflection:staticPark?.gachaReflection??createGachaReflectionSnapshot(),
}
