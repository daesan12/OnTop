import {lazy,Suspense,useEffect,useMemo,useRef} from 'react'
import {useLoader,useFrame} from '@react-three/fiber'
import {ParkAssetLoader} from '../src/world/art/assetLoader'
import {Group,Mesh,MeshStandardMaterial} from 'three'
import {PropModel} from '../src/world/art/PropModel'
import {PropSign} from '../src/world/art/CraftedProp'
import {ObservationTower} from './original/world/art/ObservationTower'
import {StonePagoda} from '../src/world/art/StonePagoda'
import {TraditionalMailbox} from '../src/world/art/TraditionalMailbox'
import {legacyIdsForSite,pavilionIdForSite,stoneTableIdAt} from './mapping/identities'
import {facilityYaw} from './facilityPlacement'
import {createGroundedEntranceModel} from './EntrancePavilion'
import {DevPlazaTable} from './DevPlazaTable'
import {OBSERVATION_TOWER,TELESCOPE} from '../src/config'
import {NOTES_BOX} from '../src/config/notes'
import {TOWER_TOP,telescopeYaw} from './towerFurniturePlan'
import {TelescopeModel} from '../src/world/art/TelescopeModel'
import {TraditionalNotesBoard} from '../src/world/art/TraditionalNotesBoard'
import {ReferenceBench} from '../src/world/art/ReferenceBenchFrames'
import {factory} from './assetFactories'
import {SITES,site,heightAt,LAKE,TABLES,JUMP_TABLES,MAILBOX_SCALE,REST_PAVILIONS,BOAT_ROUTE,DOCK_SCALE,STATION_BENCH,STATION_SCALE,BALLOON_SCALE,FISHING_DECK,FISHING_SHOP,FISHING_NOTICE,FISHING_BENCHES,FISHING_ROD_RACKS,facilityGroundY} from './plan'
import {willowPositions} from './landscape'
import {reverseSteleArrow} from './steleRefinement'
import {PreservedFitness} from './PreservedFitness'
import {PreservedPagodaGarden,FitnessFence} from './PreservedDistricts'
import {PreservedFountain} from './PreservedFountain'
import {SHOOTING_SIZE,ARCADE_SCALE,fitApprovedObject,boatAngleAt,boatPose,openDockSideEntry,groundObject,widenDockRearPassage,removeDockRearRopes} from './assetSizing'
import {ParkMoleShop} from './ParkMoleShop'
import {ParkGachaKiosk,interactWithKiosk} from './ParkGachaKiosk'
import {buildRankingBoard,RankingBoardPanels} from '../src/layout-preview/RankingBoardModel'
import {RentalPairs,distantRentalBatches} from './RentalPairs'
import { REST_FURNITURE_VERTICAL_SCALE } from './pavilionBenchLayout'
import {PavilionIntermediateTreads} from './PavilionIntermediateTreads'
import {FacilityGeometry,hasFacilityGeometry} from './FacilityGeometry'

import { models, structureModels, originalRemainingGlbs, originalFacilityGeometry } from './modelUrls'
import { bakedEntryMesh } from './static/facilities'

import { RENEWAL_DISTANCE_LOD } from '../src/park/mapSelection'
import { createTowerFrame } from './original/world/art/towerFrameGeometry'
import { LakePart, LakeStage, useLakeStageReached } from './lakeStages'
import { estimatedServerTime } from '../src/network/serverEventClock'
import { FacilityOnApproach } from './live/FacilityOnApproach'
import { ShaderPreparedGroup } from './live/ShaderPreparedGroup'
import { useLiveDuckBoat } from '../src/features/duckBoat/liveState'
import { avatars } from '../src/network/worldClient'
import { useAvatarFrameSampler } from '../src/world/AvatarPoseFrame'

const Arcade = lazy(() => import('./ArcadeBuilding'))
const VrHall = lazy(() => import('./approved/vr-skewer-hall-20261107-v1/core/frontend/src/features/skewer/parkAsset/VrSkewerHall')
  .then(module => ({ default: module.VrSkewerHall })))
const distantBuildings = new Set(['arcade', 'folk', 'vr', 'shooting'])
const willowBatchSize = Math.ceil(willowPositions.length / (LakeStage.Fish - LakeStage.Willows))

function Model({kind,fit=false,prepareShaders=false}:{kind:string;fit?:boolean;prepareShaders?:boolean}){
 const gltf=useLoader(ParkAssetLoader,models[kind]!)
 const object=useMemo(()=>{
  if(kind==='main')return createGroundedEntranceModel(gltf.scene)
  const g=gltf.scene.clone(true)
  g.traverse(o=>{if(o instanceof Mesh){o.castShadow=true;o.receiveShadow=true}})
  if(kind==='stele')reverseSteleArrow(g)
  if(kind==='dock'){
   g.userData.keepOpaque=true
   // The optimized GLB already includes the original preview's entry and passage cuts.
   if(originalRemainingGlbs){
    openDockSideEntry(g)
    widenDockRearPassage(g)
   }
   removeDockRearRopes(g)
  }
  return fit?fitApprovedObject(g,SHOOTING_SIZE):['boat','dock'].includes(kind)?g:groundObject(g)
 },[gltf,fit,kind])
 const model = <><primitive object={object} dispose={null}/>{kind==='dock'&&<group userData={{keepOpaque:true}}><LocalFactory kind="dock-rear-rail"/></group>}</>
 return prepareShaders ? <ShaderPreparedGroup>{model}</ShaderPreparedGroup> : model
}
const localModelTemplates = new Map<string, Group>()
// Keep separate source geometry for repeated props so optimized GLB parts can
// still be matched to each placed instance by its source geometry identity.
const singlePlacementModels = new Set(['shooting', 'folk', 'fishing-deck', 'lake-access', 'fishing-shop', 'lake-notice', 'balloon'])
function localModel(kind: string, options: Record<string, unknown>) {
 const build = () => {
  const group = factory(kind, options)
  if (kind === 'folk') return fitApprovedObject(group, SHOOTING_SIZE)
  return ['bike','scooter','ebike','kickboard','shooting','fishing-shop','lake-notice','rod-rack','fishing-bench','sub'].includes(kind) ? groundObject(group) : group
 }
 if (!singlePlacementModels.has(kind) || Object.keys(options).length) return build()
 let source = localModelTemplates.get(kind)
 if (!source) {
  source = build()
  localModelTemplates.set(kind, source)
 }
 return source.clone(true)
}
function LocalFactory({kind,options={}}:{kind:string;options?:Record<string,unknown>}){
 const object=useMemo(()=>localModel(kind,options),[kind,options.kind,options.seed,options.height,options.spread,options.label,options.direction,options.signTexture])
 return <primitive object={object} dispose={null}/>
}
function StructureModel({kind,prepareShaders=false}:{kind:keyof typeof structureModels;prepareShaders?:boolean}){
 const gltf=useLoader(ParkAssetLoader,structureModels[kind])
 const object=useMemo(()=>{
  const group=gltf.scene.clone(true)
  const furniture=kind==='pavilion' ? group.getObjectByName('pavilion-furniture') : undefined
  if(furniture){
   const floor=.572
   furniture.scale.y*=REST_FURNITURE_VERTICAL_SCALE
   furniture.position.y+=(floor-furniture.position.y)*(1-REST_FURNITURE_VERTICAL_SCALE)
  }
  group.traverse(o=>{
   if(!(o instanceof Mesh)||!o.userData.previewSurface)return
   const {castShadow,receiveShadow,flatShading}=o.userData.previewSurface
   o.castShadow=castShadow
   o.receiveShadow=receiveShadow
   if(o.material instanceof MeshStandardMaterial)o.material.flatShading=flatShading
  })
  return group
 },[gltf])
 const model = <primitive object={object} dispose={null}/>
 // The live world restores its exterior light pool at priority .5. Compile
 // the station after that pass so its first draw uses the prepared programs.
 return prepareShaders ? <ShaderPreparedGroup priority={.75}>{model}</ShaderPreparedGroup> : model
}
function title(text:string){return(c:CanvasRenderingContext2D,w:number,h:number)=>{c.fillStyle='#eee3c8';c.fillRect(0,0,w,h);c.strokeStyle='#9e7b42';c.lineWidth=8;c.strokeRect(5,5,w-10,h-10);c.fillStyle='#284b3c';c.textAlign='center';c.textBaseline='middle';c.font=`700 ${h*.48}px "Malgun Gothic",sans-serif`;c.fillText(text,w/2,h/2,w*.91)}}
function Ranking({live}:{live:boolean}){
 const art=useMemo(()=>buildRankingBoard(),[])
 return <group onClick={live?event=>{
  if(event.delta>=5)return
  event.stopPropagation()
  interactWithKiosk('layout-photo')
 }:undefined}>
  <PropModel art={art} name="ranking-board"/>
  <PropSign draw={title('온탑 랭킹')} position={[0,4.23,.4]} width={7.2} height={.6}/>
  {live&&<RankingBoardPanels bothSides/>}
 </group>
}
function RenewalTower({distanceLod}:{distanceLod:boolean}) {
 const frame=useMemo(()=>{
  const geometry=bakedEntryMesh('tower-frame')
  performance.mark(geometry?'park-static-tower-frame-used':'park-procedural-tower-frame-used')
  return geometry
 },[])
 const scale=40/OBSERVATION_TOWER.height
 const distant = useMemo(() => distanceLod ? bakedEntryMesh('tower-frame-distant') ?? createTowerFrame(scale, 'distant') : undefined, [distanceLod,scale])
 return <group scale={[1,scale,1]}><group position={[-OBSERVATION_TOWER.x,0,-OBSERVATION_TOWER.z]}><ObservationTower verticalScale={scale} frameGeometry={frame} distantFrame={distant} frameCenter={distanceLod?site('tower'):undefined}/></group></group>
}
export function Buildings({live=false,distantReady=true,upperFacilitiesReady=distantReady,loadedRentalBatches=distantRentalBatches,entrancePavilion=true,entranceDistricts=true,entranceFacilities=true,ambientBoats=true}:{live?:boolean;distantReady?:boolean;upperFacilitiesReady?:boolean;loadedRentalBatches?:number;entrancePavilion?:boolean;entranceDistricts?:boolean;entranceFacilities?:boolean;ambientBoats?:boolean}){const mailbox=site('mailbox'),jump=site('jump'),tower=site('tower'),balloon=site('balloon');return <group name="detail-220-buildings">
 {SITES.filter(s=>s.asset&&models[s.asset]&&(distantReady||s.asset!=='stele')&&(entrancePavilion||s.id!=='pavilion')&&(entranceFacilities||s.id!=='fortune'&&s.id!=='lottery')).map(s=>{const isDock=s.asset==='dock',fit=['bread','pigeon','cafe'].includes(s.asset!),yaw=facilityYaw(s);const model=<group key={s.id} name={'facility-'+s.id} userData={{siteId:s.id,legacyFacilityIds:legacyIdsForSite(s.id),pavilionId:pavilionIdForSite(s.id)}} position={[s.x,isDock?LAKE.y:facilityGroundY(s)+.1,s.z]} rotation={[0,yaw,0]} scale={isDock?DOCK_SCALE:s.asset==='stele'?1.45:1} onClick={s.id==='stele'?e=>{e.stopPropagation();window.dispatchEvent(new Event('park-select-jump'))}:undefined}><Suspense fallback={null}><Model kind={s.asset!} fit={fit} prepareShaders={live&&s.asset==='stele'}/></Suspense></group>;return isDock?<LakePart key={s.id} at={LakeStage.Dock}>{model}</LakePart>:model})}
 {entranceFacilities&&<RentalPairs entrance/>}
 {distantReady&&(live
  ? Array.from({length:Math.min(loadedRentalBatches,distantRentalBatches)},(_, batch)=><ShaderPreparedGroup key={batch}><RentalPairs entrance={false} batch={batch}/></ShaderPreparedGroup>)
  : <RentalPairs entrance={false}/>)}

 {entranceFacilities&&<ParkGachaKiosk live={live}/>}
 {entranceFacilities&&<ParkMoleShop optimizedReady={distantReady}/>}
 {['arcade','vr','folk','ranking','shooting'].map(id => {
  const waitForApproach = distantBuildings.has(id)
  if (waitForApproach && !distantReady) return null
  const s = site(id)
  const building = <group key={id} name={'facility-'+id} userData={{siteId:id,legacyFacilityIds:legacyIdsForSite(id)}} position={[s.x,facilityGroundY(s)+.1,s.z]} rotation={[0,facilityYaw(s),0]} scale={id==='arcade'?[...ARCADE_SCALE]:1}>
   {id==='shooting'||id==='folk'?<LocalFactory kind={id}/>:id==='arcade'?<Suspense fallback={null}><Arcade/></Suspense>:id==='vr'?<Suspense fallback={null}><VrHall/></Suspense>:<Ranking live={live}/>}
   {distantReady&&id!=='arcade'&&!originalFacilityGeometry&&hasFacilityGeometry(id)&&<Suspense fallback={null}><FacilityGeometry id={id}/></Suspense>}
  </group>
  return live && waitForApproach ? <FacilityOnApproach key={id} site={s}>{building}</FacilityOnApproach> : building
 })}
 <TraditionalMailbox position={[mailbox.x,heightAt(mailbox.x,mailbox.z)+.1,mailbox.z]} scale={MAILBOX_SCALE} yaw={mailbox.yaw}/>
 {!live&&[...TABLES,...JUMP_TABLES].map(([x,z],i)=><group key={i} position={[x,heightAt(x,z)+.12,z]}><DevPlazaTable anchorId={stoneTableIdAt(x,z)}/></group>)}
 <PreservedPagodaGarden/>{entranceDistricts&&<PreservedFountain/>}
 <group name="jump-course-entrance-pagoda" position={[jump.x,heightAt(jump.x,jump.z),jump.z]}><StonePagoda anchor={{id:'detail-jump-base',x:0,z:0,scale:.8}} decorations={false}/></group>
 <group name="forty-metre-tower" position={[tower.x,heightAt(tower.x,tower.z),tower.z]} rotation={[0,Math.PI,0]}>
  <RenewalTower distanceLod={live&&RENEWAL_DISTANCE_LOD}/>
  {distantReady&&!originalFacilityGeometry&&(live
   ? <FacilityOnApproach site={tower}><Suspense fallback={null}><FacilityGeometry id="tower"/></Suspense></FacilityOnApproach>
   : <Suspense fallback={null}><FacilityGeometry id="tower"/></Suspense>)}
 </group>
 {upperFacilitiesReady&&(live?<ShaderPreparedGroup><TowerFurniture/></ShaderPreparedGroup>:<TowerFurniture/>)}{entranceDistricts&&<PreservedFitness/>}<FitnessFence/>
 {upperFacilitiesReady&&<group name="enlarged-balloon-boarding-platform" userData={{keepOpaque:true}} position={[balloon.x,heightAt(balloon.x,balloon.z),balloon.z]}>
  <group name="balloon-station-model">
   <group scale={STATION_SCALE}>{live
    ? <ShaderPreparedGroup priority={.75}><LocalFactory kind="station"/></ShaderPreparedGroup>
    : <LocalFactory kind="station"/>}</group>
  </group>
  <ReferenceBench name="balloon-station-waiting-bench"
    position={[STATION_BENCH.x,STATION_BENCH.floor,STATION_BENCH.z]} yaw={0} seatHeight={STATION_BENCH.seatHeight}/>
  <group position={[2.35*1.6*STATION_SCALE,.65*STATION_SCALE-.37*BALLOON_SCALE+.12,0]} scale={BALLOON_SCALE}>
   {live ? <ShaderPreparedGroup><LocalFactory kind="balloon"/></ShaderPreparedGroup> : <LocalFactory kind="balloon"/>}
  </group>
 </group>}
 {REST_PAVILIONS.map(([x,z],i)=><group key={i} name={'facility-rest-'+(i+1)} userData={{pavilionId:pavilionIdForSite('rest-'+(i+1))}} position={[x,heightAt(x,z),z]} rotation={[0,site('rest-'+(i+1)).yaw!,0]}><Suspense fallback={null}><StructureModel kind="pavilion"/></Suspense><PavilionIntermediateTreads/></group>)}
 <LakePart at={LakeStage.Willows}><LakeWillows/></LakePart>
 <LakePart at={LakeStage.IslandPavilion}><group name="enlarged-island-pavilion" userData={{pavilionId:'P5'}} position={[LAKE.island.x,4.2,LAKE.island.z]} rotation={[0,-Math.PI/2,0]}><Suspense fallback={null}><StructureModel kind="pavilion"/></Suspense><PavilionIntermediateTreads/></group></LakePart>
 {ambientBoats && live && <RentalBoatSlot/>}
 {ambientBoats && <LakePart at={LakeStage.Boats}>
  {!live && <group name="moored-duck-boat" position={[site('dock').x-2.1,LAKE.y+.08,site('dock').z-3.7]}><Suspense fallback={null}><Model kind="boat"/></Suspense></group>}
  <group name="moored-duck-boat" position={[site('dock').x+2.1,LAKE.y+.08,site('dock').z-3.7]}><Suspense fallback={null}><Model kind="boat"/></Suspense></group>
 </LakePart>}
 <FishingPier/>
 {ambientBoats && <LakePart at={LakeStage.Boats}><Boats live={live}/></LakePart>}
 <LakePart at={LakeStage.FishingShop}>
  <group position={[FISHING_SHOP.x,FISHING_SHOP.y+.1,FISHING_SHOP.z]} rotation={[0,FISHING_SHOP.yaw,0]}><LocalFactory kind="fishing-shop"/></group>
 </LakePart>

 </group>}
function LakeWillows() {
 return <>{willowPositions.map(([x,z],i)=><LakePart key={i} at={LakeStage.Willows+Math.floor(i/willowBatchSize)}>
  <LakeWillow x={x} z={z} index={i}/>
 </LakePart>)}</>
}
function LakeWillow({x,z,index}:{x:number;z:number;index:number}) {
 return <group position={[x,heightAt(x,z),z]}><LocalFactory kind="willow" options={{seed:42+index,height:8.2+(index%3),spread:4.8}}/></group>
}
function FishingPier(){const d=FISHING_DECK;return <group name="native-fishing-district-no-stone-tables">
 <LakePart at={LakeStage.FishingDeck}><LocalFactory kind="fishing-deck"/></LakePart>
 <LakePart at={LakeStage.FishingAccess}><LocalFactory kind="lake-access"/></LakePart>
 <LakePart at={LakeStage.FishingFurniture}>
  {FISHING_ROD_RACKS.map(([x,z],i)=><group key={i} position={[x!,d.top,z!]} rotation={[0,-Math.PI/2,0]}><LocalFactory kind="rod-rack"/></group>)}
  <group position={[FISHING_NOTICE.x,heightAt(FISHING_NOTICE.x,FISHING_NOTICE.z)+.1,FISHING_NOTICE.z]} rotation={[0,FISHING_NOTICE.yaw,0]}><LocalFactory kind="lake-notice"/></group>
  {FISHING_BENCHES.map(([x,z,yaw],i)=><group key={i} name={'fishing-rest-bench-'+i} position={[x!,FISHING_DECK.top,z!]} rotation={[0,yaw!,0]}><LocalFactory kind="fishing-bench"/></group>)}
 </LakePart>
 </group>}
function RentalBoatSlot() {
 const closeToDock = useLakeStageReached(LakeStage.Dock)
 const running = useLiveDuckBoat(s => !!s.boat)
 return closeToDock || running ? <Suspense fallback={null}><LiveRentalBoat/></Suspense> : null
}
function LiveRentalBoat() {
 const hull = useRef<Group>(null)
 const sample = useAvatarFrameSampler()
 const rider = useMemo(() => ({x:0,y:0,z:0,yaw:0}), [])
 const dock = site('dock')
 useEffect(() => {
  useLiveDuckBoat.setState({modelReady:true})
  return () => useLiveDuckBoat.setState({modelReady:false})
 }, [])
 useFrame(() => {
  if (!hull.current) return
  const trip = useLiveDuckBoat.getState().boat
  const avatar = trip && avatars.get(trip.userId)
  if (!trip || !avatar) {
   hull.current.position.set(dock.x-2.1,LAKE.y+.08,dock.z-3.7)
   hull.current.rotation.y = 0
   return
  }
  sample(avatar,performance.now(),rider)
  const yaw = rider.yaw - Math.PI, sin = Math.sin(yaw), cos = Math.cos(yaw)
  hull.current.position.set(rider.x+.47*cos-.48*sin,trip.pose.y,rider.z-.47*sin-.48*cos)
  hull.current.rotation.y = yaw
 })
 return <group ref={hull} name="rental-duck-boat" position={[dock.x-2.1,LAKE.y+.08,dock.z-3.7]}>
  <Model kind="boat"/>
 </group>
}
function Boats({live}:{live:boolean}){
 const boats=useMemo(()=>{const g=new Group();g.name='single-circulating-duck-boat';return[g]},[])
 useFrame(({clock})=>{const t=live?estimatedServerTime()/1000:clock.getElapsedTime();boats.forEach(g=>{const p=boatPose(boatAngleAt(t,BOAT_ROUTE.period),BOAT_ROUTE.x,BOAT_ROUTE.z,BOAT_ROUTE.rx,BOAT_ROUTE.rz);g.position.set(p.x,LAKE.y+.08,p.z);g.rotation.y=p.yaw})})
 return <>{boats.map((g,i)=><primitive key={i} object={g}><Suspense fallback={null}><Model kind="boat"/></Suspense></primitive>)}</>
}

/** Local furniture is kept at human scale even though the tower is stretched to 40 m. */
function TowerFurniture(){const t=site('tower'),floor=facilityGroundY(t)+TOWER_TOP.floor;return <group name="ordered-tower-rim-furniture" position={[t.x,floor,t.z]}>
 {TOWER_TOP.telescopes.map(([x,z],i)=><group key={i} name="inward-looking-telescope" position={[x,.015,z]} rotation={[0,telescopeYaw(t.x+x,t.z+z),0]}><TelescopeModel part="base"/><TelescopeModel part="yoke"/><group position={[0,TELESCOPE.eyeHeight,0]} rotation={[-.35,0,0]}><TelescopeModel part="head"/></group></group>)}
 <group position={[TOWER_TOP.notes[0],.015,TOWER_TOP.notes[1]]} rotation={[0,Math.atan2(-TOWER_TOP.notes[0],-TOWER_TOP.notes[1]),0]}><group position={[-NOTES_BOX.x,-NOTES_BOX.y,-NOTES_BOX.z]}><TraditionalNotesBoard showFeedStatus/></group></group>
 {TOWER_TOP.benches.map(([x,z],i)=><ReferenceBench key={i} name={'tower-rest-bench-'+i} position={[x,.015,z]} yaw={Math.atan2(-x,-z)} seatHeight={.56}/>)}
 </group>}
