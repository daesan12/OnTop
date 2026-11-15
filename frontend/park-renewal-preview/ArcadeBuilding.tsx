import {Suspense,useMemo} from 'react'
import {PropModel} from '../src/world/art/PropModel'
import {PropSign} from '../src/world/art/CraftedProp'
import {bakedArcadeArt} from './static/facilities'
import {FacilityGeometry} from './FacilityGeometry'
import {originalFacilityGeometry} from './modelUrls'
import {ARCADE_CABINETS} from './live/recreation'
import {ArcadeNeon} from './approved/arcade-building-20261107-v1/core/frontend/src/layout-preview/ArcadeNeon'
import {drawArcadeMarquee,drawArcadeSide,ARCADE_MARQUEE} from './approved/arcade-building-20261107-v1/core/frontend/src/world/art/arcadeExterior'
import {drawArcadeInteriorBanner,drawArcadeInteriorMural,drawArcadeFloorBadge} from './approved/arcade-building-20261107-v1/core/frontend/src/world/art/arcadeInterior'
import {RpsRouletteCabinetModel} from './original/features/rpsRoulette/RpsRouletteCabinetModel.tsx'
import {PlusMinusCabinetModel} from './original/features/plusMinus/PlusMinusCabinetModel.tsx'
import { createArcadeArt } from './static/arcadeArt'

export default function Arcade(){
 const art=useMemo(()=>bakedArcadeArt() ?? createArcadeArt(),[])
 return <><PropModel art={art.body} name="approved-arcade-body"/><PropModel art={art.roof} name="approved-arcade-roof"/><PropModel art={art.walls} name="approved-arcade-walls"/><ArcadeNeon width={18} depth={12}/><PropSign width={12.1} height={1.12} position={[0,4.7,-5.64]} draw={drawArcadeInteriorBanner}/><PropSign width={7.9} height={2.16} position={[8.65,3.65,.1]} rotation={[0,-Math.PI/2,0]} draw={drawArcadeInteriorMural}/><PropSign width={3.4} height={3.4} position={[0,.167,1.7]} rotation={[-Math.PI/2,0,0]} draw={drawArcadeFloorBadge}/><PropSign width={ARCADE_MARQUEE.width} height={ARCADE_MARQUEE.height} position={[0,6.4+ARCADE_MARQUEE.heightOffset,6+ARCADE_MARQUEE.frontOffset]} draw={drawArcadeMarquee}/>{[-1,1].map(side=><PropSign key={side} width={3.6} height={.7} position={[side*9.425,5.25,0]} rotation={[0,side*Math.PI/2,0]} draw={drawArcadeSide}/>)}<group position={[...ARCADE_CABINETS['rps-roulette-cabinet']]} scale={1.5}><RpsRouletteCabinetModel/></group><group position={[...ARCADE_CABINETS['plus-minus-cabinet']]} scale={1.5}><PlusMinusCabinetModel/></group>{!originalFacilityGeometry&&<Suspense fallback={null}><FacilityGeometry id="arcade"/></Suspense>}</>
}
