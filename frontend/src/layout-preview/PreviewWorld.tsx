import { PreviewLandscaping } from './PreviewLandscaping'
import { PlazaBuilding } from './PlazaBuildings'
import { PreviewJumpCourse } from './PreviewJumpCourse'
import { pagodaBalustradeArt } from './pagodaBalustrade'
import { mainGateArt,eventGroveArt,vrStoneFurnitureArt } from './reviewFurnitureGeometry'
import { ReferenceFlowerBeds } from '../world/art/ReferenceGarden'
import { ReferenceBench } from '../world/art/ReferenceBenchFrames'
import { memo } from 'react'
import { DoubleSide } from 'three'
import { PropModel } from '../world/art/PropModel'
import { PropSign } from '../world/art/CraftedProp'
import { Instances } from '../world/art/Instances'
import { SurfaceMaterial } from '../world/art/SurfaceMaterial'
import { PavilionSlot, ObservationTower } from '../world/art/PlannedLandmarks'
import { PavilionInterior } from '../world/art/PavilionInterior'
import { MainPavilionRefinements } from '../world/art/LandmarkRefinements'
import { TableShell } from '../features/tables/TableShell'
import { TraditionalMailbox } from '../world/art/TraditionalMailbox'
import { CodeFishBreadCart } from '../world/art/CodeFishBreadCart'
import { VrHanokBooth } from '../world/art/ActivityProps'
import { FitnessGarden } from '../world/art/FitnessGarden'
import { StonePagoda } from '../world/art/StonePagoda'
import { ParkFountain } from '../world/art/ParkFountain'
import { Water } from '../world/art/WaterGarden'
import { LakeFish } from '../world/art/LakeFish'
import { vrBoothArt } from '../world/art/activityPropGeometry'
import { ParkLamps } from '../world/art/ParkFurniture'
import { ENVIRONMENT, MINI_PROPS, MAILBOX, GARDEN_PAGODA,VR_PAGODA,LAKE } from '../config'
import { DRAFT_PARK,SETTINGS,DRAFT_PAVILIONS,DRAFT_TABLES,DRAFT_FITNESS_AREA,DRAFT_FITNESS_STATIONS,DRAFT_TOWER_BENCHES,DRAFT_FOUNTAIN,PLAZA_REST_BENCHES,PLAZA_BEDS,PLAZA_BENCHES,DRAFT_LAMPS,MAIN_GATE,VR_YAW,SITES,MARKERS,ORIGINAL_SITES } from './layout'
import { lawn,gardenArt,pavilionStairsArt,cityArt,detailArt,trunks,crowns,flowers,shrubs,lakeBank,shoreTrunks,shoreCrowns } from './sceneGeometry'
import { pathPaving,pathCurbs,fenceArt,plazaArt } from './landscapeGeometry'
import { aquaticArt,crossingArt,lakeBed,lakeRocks,rockGeometry,shoreFenceArt } from './lakeGeometry'
import { PreviewSwimmingRipples } from './PreviewSwimmingRipples'
import { PreviewPigeons } from './PreviewPigeons'
import { PlannedCity } from '../world/art/PlannedCity'
import { EnvironmentScene } from '../world/EnvironmentScene'
import { fitnessRestArt,fountainTerrain } from './districtGeometry'

function sign(text:string,sub='ON TOP PARK') {
  return (c:CanvasRenderingContext2D,w:number,h:number)=>{
    c.fillStyle='#e9debd';c.fillRect(0,0,w,h);c.strokeStyle='#9b7846';c.lineWidth=14;c.strokeRect(10,10,w-20,h-20)
    c.fillStyle='#264a41';c.textAlign='center';c.textBaseline='middle';c.font=`700 ${h*.37}px "Malgun Gothic",sans-serif`;c.fillText(text,w/2,h*.4,w*.9)
    c.font=`${h*.15}px sans-serif`;c.fillText(sub,w/2,h*.78,w*.9)
  }
}
const signs={ad:sign('온탑에서 만나요','ON TOP · PARK LIFE')}
const zoneSigns={vr:sign('VR 체험관','VIRTUAL REALITY'),folk:sign('민속놀이 존','TRADITIONAL GAMES'),swim:sign('수영 진입로','LAKE ACCESS')}
const inspectPreviewTable=()=>{} // No live commands from the layout-review entry.
function DraftAds() {
  return <>
    {MARKERS.filter(m=>['23','24','25'].includes(m.no)).map(m=><group key={m.id} name={m.id} position={[m.x,0,m.z]}>
      {[-1,1].map(side=><mesh key={side} position={[0,.95,side*.22]} rotation={[side*.2,0,0]}><boxGeometry args={[1.3,1.9,.08]}/><meshStandardMaterial color="#344d42"/></mesh>)}
      <PropSign position={[0,1.1,.46]} width={1.02} height={1.36} draw={signs.ad}/>
    </group>)}
    <group name="advertising-balloon" position={[SITES.balloon.x,0,SITES.balloon.z]}>
      <PropSign position={[0,9.1,0]} width={3.2} height={4.25} draw={signs.ad}/>
      {[-1,1].map(side=><group key={side}>
        <mesh position={[side*1.7,13,0]} scale={[1.2,1.3,1.2]}><sphereGeometry args={[1,20,14]}/><meshStandardMaterial color={side<0?'#e6d4a8':'#bad6b0'} roughness={.3}/></mesh>
        <mesh position={[side*1.7,6.4,0]}><cylinderGeometry args={[.012,.012,12,5]}/><meshStandardMaterial color="#b4ae94"/></mesh>
      </group>)}
    </group>
  </>
}

export function PreviewLight({night}:{night:boolean}) {
  return <>
    <EnvironmentScene fixedTime={ENVIRONMENT.epochMs+ENVIRONMENT.dayDurationMs*(night?.02:.6)}/>
    <directionalLight position={[-70,110,60]} color={night?'#a2bacb':'#fff0ce'} intensity={night?.5:2.4} castShadow
      shadow-mapSize={[2048,2048]} shadow-camera-left={-115} shadow-camera-right={115} shadow-camera-top={115} shadow-camera-bottom={-115} shadow-camera-far={300} shadow-bias={-.0004}/>
    {night&&[[0,5,40],[0,5,84],[-60,5,-54],[62,8,56],[-25,5,35],[25,5,38]].map((p,i)=><pointLight key={i} position={p as [number,number,number]} color="#ffbd69" intensity={35} distance={22} decay={1.4}/>)}
  </>
}

export const PreviewWorld=memo(function PreviewWorld({live=false}:{live?:boolean}={}){
  // The review entry is isolated; the service enables the existing table interactions.
  return <group name="park-layout-draft">
    <group name="background-only" userData={{walkable:false}}><PropModel art={cityArt} name="layout-background"/>
      <PlannedCity parkSize={DRAFT_PARK.size} exteriorOnly entranceWidth={MAIN_GATE.boundaryOpening} cornerRadius={SETTINGS.park.wallCornerRadius}/>
    </group>
    <mesh geometry={lawn} dispose={null} receiveShadow><SurfaceMaterial kind="grass" mapping="box" color="#a8bc87" meters={3} strength={.12} detail={.35} side={DoubleSide}/></mesh>
    <PropModel art={gardenArt} name="layout-grounds"/>
    <PropModel art={pavilionStairsArt} name="layout-pavilion-stairs"/>
    <mesh name="layout-smooth-paths" geometry={pathPaving} dispose={null} receiveShadow><SurfaceMaterial kind="stone" mapping="box" color="#d8cfb8" meters={1.2} strength={.09} side={DoubleSide}/></mesh>
    <Instances parts={pathCurbs} shadow={false}><boxGeometry/></Instances>
    <PropModel art={fenceArt} name="layout-courtyard-fences"/>
    <PropModel art={plazaArt} name="layout-life-plaza"/>
    <group position={[0,.14,0]}><ReferenceFlowerBeds beds={PLAZA_BEDS}/></group>
    {PLAZA_BENCHES.map(b=><ReferenceBench key={b.id} name={b.id} position={[b.x,.14,b.z]} yaw={b.yaw}/>)}
    <PreviewLandscaping/>
    {PLAZA_REST_BENCHES.map(b=><ReferenceBench key={b.id} name={b.id} position={[b.x,.14,b.z]} yaw={b.yaw}/>)}
    <PropModel art={detailArt} name="layout-docks-gate-street-furniture"/>
    <group name="layout-main-gate"><PropModel art={mainGateArt} name="layout-crafted-entrance"/></group>
    <PropModel art={eventGroveArt} name="layout-event-grove"/>
    <PropModel art={vrStoneFurnitureArt} name="layout-vr-stone-furniture"/>
    <PavilionInterior placements={DRAFT_PAVILIONS}/>
    {DRAFT_PAVILIONS.map(p=><PavilionSlot key={p.id} p={p}/>)}
    <MainPavilionRefinements/>
    {DRAFT_TABLES.map(t=><TableShell key={t.id} anchor={t} onInspect={live?undefined:inspectPreviewTable}/>)}
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
    <mesh name="layout-original-fountain-terrain" geometry={fountainTerrain} dispose={null} receiveShadow><SurfaceMaterial kind="stone" mapping="box" color="#c4bfb1" side={DoubleSide}/></mesh>
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
        <Instances parts={shoreTrunks}><cylinderGeometry args={[1,1.15,1,7]}/></Instances>
        <Instances parts={shoreCrowns} shadow={false}><icosahedronGeometry args={[1,1]}/></Instances>
      </group>
      {SETTINGS.lake.swimEntryOffsets.map(offset=><PropSign key={offset} position={[SITES.lake.x+offset,1.3,SITES.lake.z-4.5]} width={1.6} height={.6} draw={zoneSigns.swim}/>)}
      {!live&&<PreviewSwimmingRipples/>}
    </group>
    <group name="fish-bread" position={[SITES.cart.x,0,SITES.cart.z]}><CodeFishBreadCart/></group>
    <group position={[SITES.mailbox.x-MAILBOX.x,0,SITES.mailbox.z-MAILBOX.z]}><TraditionalMailbox/></group>
    <PlazaBuilding kind="shop"/><PlazaBuilding kind="drink"/><PlazaBuilding kind="photo"/><DraftAds/>
    <PreviewPigeons live={live}/>
    <Instances parts={trunks} shadow={false}><cylinderGeometry args={[1,1.2,1,7]}/></Instances>
    <Instances parts={crowns} shadow={false}><icosahedronGeometry args={[1,1]}/></Instances>
    <Instances parts={shrubs} shadow={false}><icosahedronGeometry args={[1,1]}/></Instances>
    <Instances parts={flowers} shadow={false}><icosahedronGeometry args={[1,0]}/></Instances>
    <ParkLamps placements={DRAFT_LAMPS}/>
  </group>
})
