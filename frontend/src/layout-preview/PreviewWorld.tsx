import { SIMPLE_MAP } from '../world/art/mapRenderProfile'
import { simpleEnvironmentPalette } from '../world/simpleEnvironmentPalette'
import { existingTreeModel } from './existingTreeModel'
import { FacetedParkTreeInstances } from '../world/art/FacetedParkTreeInstances'
import { buildParkTreeParts } from '../world/art/parkTreeParts'
import { PreviewLandscaping } from './PreviewLandscaping'
import { PlazaBuilding } from './PlazaBuildings'
import { RankingBoardModel } from './RankingBoardModel'
import { PreviewJumpCourse } from './PreviewJumpCourse'
import { pagodaBalustradeArt } from './pagodaBalustrade'
import { mainGateArt,eventGroveArt } from './reviewFurnitureGeometry'
import { PARK_DATA } from '../map/park'
import { ReferenceFlowerBeds } from '../world/art/ReferenceGarden'
import { ReferenceBench } from '../world/art/ReferenceBenchFrames'
import { memo } from 'react'
import { DoubleSide } from 'three'
import { PropModel } from '../world/art/PropModel'
import { PropSign } from '../world/art/CraftedProp'
import { Instances } from '../world/art/Instances'
import { SurfaceMaterial } from '../world/art/SurfaceMaterial'
import { WalkwayMaterial } from '../world/art/WalkwayMaterial'
import { PavilionSlot, ObservationTower } from '../world/art/PlannedLandmarks'
import { PavilionInterior } from '../world/art/PavilionInterior'
import { TraditionalPavilionLanterns } from '../world/art/TraditionalPavilionLanterns'
import { MainPavilionRefinements } from '../world/art/LandmarkRefinements'
import { TableShell } from '../features/tables/TableShell'
import { TraditionalMailbox } from '../world/art/TraditionalMailbox'
import { FishBreadShop } from '../world/art/LuckyFacilities'
import { VrHanokBooth } from '../world/art/ActivityProps'
import { FitnessGarden } from '../world/art/FitnessGarden'
import { StonePagoda } from '../world/art/StonePagoda'
import { ParkFountain } from '../world/art/ParkFountain'
import { Water } from '../world/art/WaterGarden'
import { LakeFish } from '../world/art/LakeFish'
import { vrBoothArt } from '../world/art/activityPropGeometry'
import { ParkLamps } from '../world/art/ParkFurniture'
import { ENVIRONMENT, MINI_PROPS, GARDEN_PAGODA,VR_PAGODA,LAKE } from '../config'
import { DRAFT_PARK,SETTINGS,DRAFT_PAVILIONS,DRAFT_TABLES,DRAFT_FITNESS_AREA,DRAFT_FITNESS_STATIONS,DRAFT_TOWER_BENCHES,DRAFT_FOUNTAIN,PLAZA_REST_BENCHES,PLAZA_BEDS,PLAZA_BENCHES,DRAFT_LAMPS,MAIN_GATE,VR_YAW,SITES,ORIGINAL_SITES } from './layout'
import { lawn,gardenArt,pavilionStairsArt,cityArt,detailArt,trunks,crowns,flowers,shrubs,lakeBank,shoreTrunks,shoreCrowns } from './sceneGeometry'
import { pathPaving,pathCurbs,fenceArt,plazaArt } from './landscapeGeometry'
import { aquaticArt,crossingArt,lakeBed,lakeRocks,rockGeometry,shoreFenceArt } from './lakeGeometry'
import { PreviewSwimmingRipples } from './PreviewSwimmingRipples'
import { PreviewPigeons } from './PreviewPigeons'
import { PlannedCity } from '../world/art/PlannedCity'
import { EnvironmentScene } from '../world/EnvironmentScene'
import { fitnessRestArt,fountainTerrain } from './districtGeometry'

const groveTreeModels=existingTreeModel(trunks,crowns)
const shoreTreeModels=existingTreeModel(shoreTrunks,shoreCrowns)
const fitnessTreeParts=buildParkTreeParts([{position:[SITES.fitness.x,.1,SITES.fitness.z],kind:'broadleaf',scale:1.45}])

function sign(text:string,sub='ON TOP PARK') {
  return (c:CanvasRenderingContext2D,w:number,h:number)=>{
    c.fillStyle='#e9debd';c.fillRect(0,0,w,h);c.strokeStyle='#9b7846';c.lineWidth=14;c.strokeRect(10,10,w-20,h-20)
    c.fillStyle='#264a41';c.textAlign='center';c.textBaseline='middle';c.font=`700 ${h*.37}px "Malgun Gothic",sans-serif`;c.fillText(text,w/2,h*.4,w*.9)
    c.font=`${h*.15}px sans-serif`;c.fillText(sub,w/2,h*.78,w*.9)
  }
}
const zoneSigns={vr:sign('VR 체험관','VIRTUAL REALITY'),folk:sign('민속놀이 존','TRADITIONAL GAMES'),swim:sign('수영 진입로','LAKE ACCESS')}
const inspectPreviewTable=()=>{} // No live commands from the layout-review entry.

export function PreviewLight({night}:{night:boolean}) {
  return <>
    <EnvironmentScene fixedTime={ENVIRONMENT.epochMs+ENVIRONMENT.dayDurationMs*(night?.02:.6)}/>
    <directionalLight position={[-70,110,60]} color={night?(SIMPLE_MAP?simpleEnvironmentPalette.nightKeyColor:'#a2bacb'):'#fff0ce'} intensity={night?(SIMPLE_MAP?simpleEnvironmentPalette.nightKey:.5):2.4} castShadow
      shadow-mapSize={[2048,2048]} shadow-camera-left={-115} shadow-camera-right={115} shadow-camera-top={115} shadow-camera-bottom={-115} shadow-camera-far={300} shadow-bias={-.0004}/>
    {night&&!SIMPLE_MAP&&[[0,5,40],[0,5,84],[-60,5,-54],[62,8,56],[-25,5,35],[25,5,38]].map((p,i)=><pointLight key={i} position={p as [number,number,number]} color="#ffbd69" intensity={35} distance={22} decay={1.4}/>)}
  </>
}

export const PreviewWorld=memo(function PreviewWorld({live=false,onRankingBoardInteract}:{live?:boolean;onRankingBoardInteract?:()=>void}={}){
  // The review entry is isolated; the selected service mode enables existing table interactions.
  return <group name="park-layout-draft">
    <group name="background-only" userData={{walkable:false}}><PropModel art={cityArt} name="layout-background"/>
      <PlannedCity parkSize={DRAFT_PARK.size} exteriorOnly advertising={false} entranceWidth={MAIN_GATE.boundaryOpening} cornerRadius={SETTINGS.park.wallCornerRadius}/>
    </group>
    <mesh geometry={lawn} dispose={null} receiveShadow><SurfaceMaterial kind="grass" mapping="box" color="#a8bc87" meters={3} strength={.12} detail={.35} side={DoubleSide}/></mesh>
    <PropModel art={gardenArt} name="layout-grounds" paving/>
    <PropModel art={pavilionStairsArt} name="layout-pavilion-stairs"/>
    <mesh name="layout-smooth-paths" geometry={pathPaving} dispose={null} receiveShadow><WalkwayMaterial color="#d8cfb8"/></mesh>
    <Instances parts={pathCurbs} shadow={false}><boxGeometry/></Instances>
    <PropModel art={fenceArt} name="layout-courtyard-fences"/>
    <PropModel art={plazaArt} name="layout-life-plaza" paving pavingColor="#ffffff" pavingHole={[SETTINGS.plaza.x,SETTINGS.plaza.z,SETTINGS.plaza.radius+.15]}/>
    <group position={[0,.14,0]}><ReferenceFlowerBeds beds={PLAZA_BEDS}/></group>
    {PLAZA_BENCHES.map(b=><ReferenceBench key={b.id} name={b.id} position={[b.x,.14,b.z]} yaw={b.yaw}/>)}
    <PreviewLandscaping/>
    {PLAZA_REST_BENCHES.map(b=><ReferenceBench key={b.id} name={b.id} position={[b.x,.14,b.z]} yaw={b.yaw}/>)}
    <PropModel art={detailArt} name="layout-docks-gate-street-furniture"/>
    <group name="layout-main-gate"><PropModel art={mainGateArt} name="layout-crafted-entrance"/></group>
    <PropModel art={eventGroveArt} name="layout-event-grove"/>
    <group name="layout-vr-stone-furniture">{DRAFT_TABLES.filter(t=>t.assetId==='procedural/vr-stone-game-table').map(t=><TableShell key={t.id} anchor={t} onInspect={live?undefined:inspectPreviewTable}/>)}</group>
    <PavilionInterior placements={DRAFT_PAVILIONS}/>
    {!live&&<TraditionalPavilionLanterns pavilions={DRAFT_PAVILIONS}/>}
    {DRAFT_PAVILIONS.map(p=><PavilionSlot key={p.id} p={p}/>)}
    <MainPavilionRefinements/>
    {DRAFT_TABLES.filter(t=>t.assetId!=='procedural/vr-stone-game-table').map(t=><TableShell key={t.id} anchor={t} onInspect={live?undefined:inspectPreviewTable}/>)}
    {PARK_DATA.interactions.benches.filter(b=>b.siteId.startsWith('bench-fountain-')||b.siteId.startsWith('bench-forest-')).map(b=><ReferenceBench key={b.id} name={b.id} position={[...b.position]} yaw={b.yaw} horizontalScale={b.siteId.startsWith('bench-fountain-')?DRAFT_FOUNTAIN.scale:1} seatHeight={.56}/>)}
    <group position={[SITES.pagoda.x,SITES.pagoda.floor,SITES.pagoda.z-GARDEN_PAGODA.z]}><StonePagoda anchor={GARDEN_PAGODA} decorations={false}/></group>
    <group position={[SITES.vr.x,0,SITES.vr.z]} rotation={[0,VR_YAW,0]}>
      <group position={[-MINI_PROPS[1].x,0,-MINI_PROPS[1].z]}><VrHanokBooth/></group>
      <PropSign position={[0,3.55,3.8]} width={3.4} height={.65} draw={zoneSigns.vr}/>
    </group>
    <group name="layout-hall-room" position={[SITES.folk.x,0,SITES.folk.z]} rotation={[0,VR_YAW,0]}>
      <PropModel art={vrBoothArt} name="folk-hanok-model"/>
      <PropSign position={[0,3.55,3.8]} width={3.4} height={.65} draw={zoneSigns.folk}/>
    </group>
    <StonePagoda anchor={{...VR_PAGODA,x:SITES.vrPagoda.x,z:SITES.vrPagoda.z}}/>
    {!live&&<PreviewJumpCourse/>}
    <PropModel art={pagodaBalustradeArt} name="layout-central-pagoda-stone-balustrade"/>
    <FitnessGarden area={DRAFT_FITNESS_AREA} stations={DRAFT_FITNESS_STATIONS} floorShape="ellipse" showPads={false} floorColor="#c8c0ad"/>
    <PropModel art={fitnessRestArt} name="layout-fitness-tree-and-ring-bench"/>
    <FacetedParkTreeInstances parts={fitnessTreeParts} name="layout-fitness-original-tree" treeCount={1}/>
    <mesh name="layout-original-fountain-terrain" geometry={fountainTerrain} dispose={null} receiveShadow><WalkwayMaterial color="#c4bfb1"/></mesh>
    <group name="layout-enlarged-fountain" position={[SITES.fountain.x,0,SITES.fountain.z]} scale={[DRAFT_FOUNTAIN.scale,1,DRAFT_FOUNTAIN.scale]}><group position={[-ORIGINAL_SITES.fountain.x,0,-ORIGINAL_SITES.fountain.z]}><ParkFountain quality="high" jetHeightScale={DRAFT_FOUNTAIN.jetHeightScale}/></group></group>
    <group position={[SITES.tower.x-ORIGINAL_SITES.tower.x,0,SITES.tower.z-ORIGINAL_SITES.tower.z]}><ObservationTower/></group>
    {DRAFT_TOWER_BENCHES.map(b=><ReferenceBench key={b.id} name={b.id} position={[b.x,b.y,b.z]} yaw={b.yaw}/>)}
    <group name="lake-district"><Water position={[SITES.lake.x,SITES.lake.surfaceY,SITES.lake.z]} radius={[SITES.lake.rx,SITES.lake.rz]}/>
      <mesh name="layout-lake-bed" geometry={lakeBed} dispose={null} receiveShadow><SurfaceMaterial kind="stone" mapping="box" color="#7b8b6d" side={DoubleSide}/></mesh>
      <Instances parts={lakeBank} shadow={false}><cylinderGeometry args={[1,1,1,6]}/></Instances>
      <PropModel art={shoreFenceArt} name="layout-shore-fence"/>
      <PropModel art={crossingArt} name="layout-lake-crossings"/>
      <PropModel art={aquaticArt} name="layout-lotus-and-reeds"/>
      <group name="layout-lake-rocks"><Instances parts={lakeRocks} material={<SurfaceMaterial kind="stone" mapping="box" strength={.3} detail={.45}/>} ><primitive object={rockGeometry} attach="geometry" dispose={null}/></Instances></group>
      <group name="layout-transformed-fish" position={[SITES.lake.x-LAKE.x*SITES.lake.rx/LAKE.radiusX,0,SITES.lake.z-LAKE.z*SITES.lake.rz/LAKE.radiusZ]} scale={[SITES.lake.rx/LAKE.radiusX,1,SITES.lake.rz/LAKE.radiusZ]}><LakeFish quality="high"/></group>
      <group name="layout-shore-trees" userData={{plannedSpecies:'willow'}}>
        <FacetedParkTreeInstances parts={shoreTreeModels.parts} name="layout-shore-original-trees" treeCount={shoreTreeModels.plantings.length}/>
      </group>
      {SETTINGS.lake.swimEntryOffsets.map(offset=><PropSign key={offset} position={[SITES.lake.x+offset,1.3,SITES.lake.z-4.5]} width={1.6} height={.6} draw={zoneSigns.swim}/>)}
      {!live&&<PreviewSwimmingRipples/>}
    </group>
    <group name="fish-bread" position={[SITES.cart.x,0,SITES.cart.z]} userData={{assetId:"user/repaired-fish-cart"}}><FishBreadShop/></group>
    <TraditionalMailbox position={[SITES.mailbox.x,0,SITES.mailbox.z]} scale={SETTINGS.mailbox.scale} yaw={SETTINGS.mailbox.yaw}/>
    <PlazaBuilding kind="shop" live={live}/><PlazaBuilding kind="drink" live={live}/>
    <RankingBoardModel onInteract={onRankingBoardInteract}/>
    <PreviewPigeons live={live}/>
    <FacetedParkTreeInstances parts={groveTreeModels.parts} name="layout-grove-original-trees" treeCount={groveTreeModels.plantings.length}/>
    <Instances parts={shrubs} shadow={false}><icosahedronGeometry args={[1,SIMPLE_MAP?0:1]}/></Instances>
    <Instances parts={SIMPLE_MAP?flowers.filter((_,i)=>i%3===0):flowers} shadow={false}><icosahedronGeometry args={[1,0]}/></Instances>
    <ParkLamps placements={DRAFT_LAMPS}/>
  </group>
})
