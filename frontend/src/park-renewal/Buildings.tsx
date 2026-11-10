import {Suspense,useMemo} from 'react'
import {useLoader,useFrame} from '@react-three/fiber'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {Group,Mesh} from 'three'
import {PropBuilder} from '../world/art/propGeometry'
import {PropModel} from '../world/art/PropModel'
import {PropSign} from '../world/art/CraftedProp'
import {ObservationTower} from '../world/art/PlannedLandmarks'
import {StonePagoda} from '../world/art/StonePagoda'
import {TraditionalMailbox} from '../world/art/TraditionalMailbox'
import {legacyIdsForSite,pavilionIdForSite,stoneTableIdAt} from './mapping/identities'
import {facilityYaw} from './facilityPlacement'
import {DevPlazaTable} from './DevPlazaTable'
import {OBSERVATION_TOWER,TELESCOPE} from '../config'
import {NOTES_BOX} from '../config/notes'
import {TOWER_TOP,telescopeYaw} from './towerFurniturePlan'
import {TelescopeModel} from '../world/art/TelescopeModel'
import {TraditionalNotesBoard} from '../world/art/TraditionalNotesBoard'
import {ReferenceBench} from '../world/art/ReferenceBenchFrames'
import {factory,rentalLabel} from './assetFactories'
import {SITES,site,heightAt,LAKE,TABLES,JUMP_TABLES,MAILBOX_SCALE,REST_PAVILIONS,BOAT_ROUTE,SUB_PAVILION_SCALE,DOCK_SCALE,STATION_SCALE,BALLOON_SCALE,RENTAL_PAIR_SPACING,rentalYaw,FISHING_DECK,FISHING_SHOP,FISHING_NOTICE,FISHING_BENCHES,facilityGroundY} from './plan'
import {willowPositions} from './landscape'
import {reverseSteleArrow} from './steleRefinement'
import {PreservedFitness} from './PreservedFitness'
import {PreservedFountain,PreservedPagodaGarden,FitnessFence} from './PreservedDistricts'
import {SHOOTING_SIZE,ARCADE_SCALE,fitApprovedObject,boatPose,openDockSideEntry,groundObject,widenDockRearPassage} from './assetSizing'
import {VerticalMoleAttract} from './VerticalMoleAttract'
import {ArcadeNeon} from './approved/arcade-building-20261107-v1/core/frontend/src/layout-preview/ArcadeNeon'
import {type RecreationFacility} from '../map/park/recreation'
import {buildMoleShop} from './approved/mole-shop-20261107-v1/core/frontend/src/world/art/moleShopGeometry'
import {addArcadeExterior,drawArcadeMarquee,drawArcadeSide,ARCADE_MARQUEE} from './approved/arcade-building-20261107-v1/core/frontend/src/world/art/arcadeExterior'
import {addArcadeInterior,addArcadeWallLining,drawArcadeInteriorBanner,drawArcadeInteriorMural,drawArcadeFloorBadge} from './approved/arcade-building-20261107-v1/core/frontend/src/world/art/arcadeInterior'
import {VrSkewerHall as ApprovedVrHall} from './approved/vr-skewer-hall-20261107-v1/core/frontend/src/features/skewer/parkAsset/VrSkewerHall'
import {GachaMachine} from '../features/gacha/parkAsset/GachaMachine'
import {buildRankingBoard} from '../layout-preview/RankingBoardModel'
import {RpsRouletteCabinetModel} from '../features/rpsRoulette/RpsRouletteCabinetModel'
import {PlusMinusCabinetModel} from '../features/plusMinus/PlusMinusCabinetModel'

const models:Record<string,string>={main:'main-octagonal-pavilion-5.glb',fortune:'ontop-fortune-room-4.glb',lottery:'ontop-lottery-shop-2.glb',bread:'bungeoppang-shop.glb',pigeon:'pigeon-shop.glb',dock:'duck-dock-3.glb',cafe:'hanjeongseon-cafe-2.glb',stele:'jumpmap-stele-a.glb',boat:'duck-boat-1.glb'}
const rentalTextures={bike:rentalLabel('bicycle'),scooter:rentalLabel('scooter')}
const assetURL=(path:string)=>'/art/park-renewal/'+path
function Model({kind,fit=false}:{kind:string;fit?:boolean}){
 const gltf=useLoader(GLTFLoader,assetURL(models[kind]!))
 const object=useMemo(()=>{const g=gltf.scene.clone(true);g.traverse(o=>{if(o instanceof Mesh){o.castShadow=true;o.receiveShadow=true}});if(kind==='stele')reverseSteleArrow(g);if(kind==='dock'){openDockSideEntry(g);widenDockRearPassage(g);g.add(factory('dock-rear-floor'))}return fit?fitApprovedObject(g,SHOOTING_SIZE):['boat','dock'].includes(kind)?g:groundObject(g)},[gltf,fit,kind])
 return <primitive object={object} dispose={null}/>
}
function LocalFactory({kind,options={}}:{kind:string;options?:Record<string,unknown>}){
 // Static scene assets are created once; shared clones never dispose their source.
 const object=useMemo(()=>{const g=factory(kind,options);return kind==='folk'?fitApprovedObject(g,SHOOTING_SIZE):['bike','scooter','ebike','kickboard','shooting','fishing-shop','lake-notice','rod-rack','fishing-bench','sub'].includes(kind)?groundObject(g):g},[kind,options.kind,options.seed,options.height,options.spread,options.label,options.direction,options.signTexture])
 return <primitive object={object} dispose={null}/>
}
function title(text:string){return(c:CanvasRenderingContext2D,w:number,h:number)=>{c.fillStyle='#eee3c8';c.fillRect(0,0,w,h);c.strokeStyle='#9e7b42';c.lineWidth=8;c.strokeRect(5,5,w-10,h-10);c.fillStyle='#284b3c';c.textAlign='center';c.textBaseline='middle';c.font=`700 ${h*.48}px "Malgun Gothic",sans-serif`;c.fillText(text,w/2,h/2,w*.91)}}
function Mole(){
 const f:RecreationFacility={id:'renewal-mole',kind:'mole',label:'두더지 잡기',x:0,z:0,width:10,depth:7,height:6.4,yaw:0,doorWidth:4}
 const art=useMemo(()=>buildMoleShop({...f}),[])
 return <><PropModel art={art.body} name="approved-mole-body"/><PropModel art={art.roof} name="approved-mole-roof"/><PropModel art={art.walls} name="approved-mole-walls"/><PropSign draw={art.draw} position={[0,4.4,3.7]} width={3.1} height={.55}/><VerticalMoleAttract facility={f}/></>
}
function Arcade(){
 const art=useMemo(()=>{const b=new PropBuilder(),r=new PropBuilder(),w=new PropBuilder(),f={width:18,depth:12,height:6.4,doorWidth:4.6};b.box('stone','#c9bea1',[0,.04,0],[19.6,.08,13.6]);b.box('stone','#d8cfb8',[0,.1,0],[18,.08,12]);w.box('paint','#e0ddc9',[0,3.2,-6],[18,6.4,.32]);for(const side of[-1,1]){w.box('paint','#e0ddc9',[side*9,3.2,0],[.32,6.4,12]);w.box('paint','#e0ddc9',[side*5.65,3.2,6],[6.7,6.4,.32]);for(const z of[-6,6])b.box('wood','#755135',[side*9,3.2,z],[.3,6.4,.3])}addArcadeExterior(b,r,w,f);addArcadeWallLining(w,f);addArcadeInterior(b,f);return {body:b.finish(),roof:r.finish(),walls:w.finish()}},[])
 return <><PropModel art={art.body} name="approved-arcade-body"/><PropModel art={art.roof} name="approved-arcade-roof"/><PropModel art={art.walls} name="approved-arcade-walls"/><ArcadeNeon width={18} depth={12}/><PropSign width={12.1} height={1.12} position={[0,4.7,-5.64]} draw={drawArcadeInteriorBanner}/><PropSign width={7.9} height={2.16} position={[8.65,3.65,.1]} rotation={[0,-Math.PI/2,0]} draw={drawArcadeInteriorMural}/><PropSign width={3.4} height={3.4} position={[0,.167,1.7]} rotation={[-Math.PI/2,0,0]} draw={drawArcadeFloorBadge}/><PropSign width={ARCADE_MARQUEE.width} height={ARCADE_MARQUEE.height} position={[0,6.4+ARCADE_MARQUEE.heightOffset,6+ARCADE_MARQUEE.frontOffset]} draw={drawArcadeMarquee}/>{[-1,1].map(side=><PropSign key={side} width={3.6} height={.7} position={[side*9.425,5.25,0]} rotation={[0,side*Math.PI/2,0]} draw={drawArcadeSide}/>)}<group position={[-6,.14,-3.6]} scale={1.5}><RpsRouletteCabinetModel/></group><group position={[-2,.14,-3.6]} scale={1.5}><PlusMinusCabinetModel/></group></>
}
function VrHall(){return <ApprovedVrHall/>}
function Gacha(){return <GachaMachine/>}
function Ranking(){const art=useMemo(()=>buildRankingBoard(),[]);return <><PropModel art={art} name="ranking-board"/><PropSign draw={title('온탑 랭킹')} position={[0,4.23,.4]} width={7.2} height={.6}/></>}
export function Buildings({live=false}:{live?:boolean}){const mailbox=site('mailbox'),jump=site('jump'),tower=site('tower'),balloon=site('balloon');return <group name="detail-220-buildings">
 {SITES.filter(s=>s.asset&&models[s.asset]).map(s=>{const isDock=s.asset==='dock',fit=['bread','pigeon','cafe'].includes(s.asset!),yaw=facilityYaw(s);return <group key={s.id} name={'facility-'+s.id} userData={{siteId:s.id,legacyFacilityIds:legacyIdsForSite(s.id),pavilionId:pavilionIdForSite(s.id)}} position={[s.x,isDock?LAKE.y:facilityGroundY(s)+.1,s.z]} rotation={[0,yaw,0]} scale={isDock?DOCK_SCALE:s.asset==='stele'?1.45:1} onClick={s.id==='stele'?e=>{e.stopPropagation();window.dispatchEvent(new Event('park-select-jump'))}:undefined}><Suspense fallback={null}><Model kind={s.asset!} fit={fit}/></Suspense></group>})}
 {SITES.filter(s=>s.asset==='pair').map(s=><group key={s.id} name={'paired-rental-'+s.id} position={[s.x,facilityGroundY(s)+.1,s.z]} rotation={[0,rentalYaw(s),0]}>{[-1,1].map((side,i)=><group key={side} position={[side*RENTAL_PAIR_SPACING/2,0,0]}><LocalFactory kind="rental-bay" options={{kind:i===0?'bicycle':'scooter',signTexture:rentalTextures[i===0?'bike':'scooter']}}/></group>)}</group>)}

 {['mole','arcade','vr','folk','gacha','ranking','shooting'].map(id=>{const s=site(id);return <group key={id} name={'facility-'+id} userData={{siteId:id,legacyFacilityIds:legacyIdsForSite(id)}} position={[s.x,facilityGroundY(s)+.1,s.z]} rotation={[0,facilityYaw(s),0]} scale={id==='arcade'?[...ARCADE_SCALE]:1}>{id==='shooting'||id==='folk'?<LocalFactory kind={id}/>:id==='mole'?<Mole/>:id==='arcade'?<Arcade/>:id==='vr'?<VrHall/>:id==='gacha'?<Gacha/>:<Ranking/>}</group>})}
 <TraditionalMailbox position={[mailbox.x,heightAt(mailbox.x,mailbox.z)+.1,mailbox.z]} scale={MAILBOX_SCALE} yaw={mailbox.yaw}/>
 {!live&&[...TABLES,...JUMP_TABLES].map(([x,z],i)=><group key={i} position={[x,heightAt(x,z)+.12,z]}><DevPlazaTable anchorId={stoneTableIdAt(x,z)}/></group>)}
 <PreservedPagodaGarden/><PreservedFountain/>
 <group position={[jump.x,heightAt(jump.x,jump.z),jump.z]}><StonePagoda anchor={{id:'detail-jump-base',x:0,z:0,scale:.8}} decorations={false}/></group>
 <group name="forty-metre-tower" position={[tower.x,heightAt(tower.x,tower.z),tower.z]} rotation={[0,Math.PI,0]}><group scale={[1,40/OBSERVATION_TOWER.height,1]}><group position={[-OBSERVATION_TOWER.x,0,-OBSERVATION_TOWER.z]}><ObservationTower furniture={false}/></group></group></group>
 <TowerFurniture/><PreservedFitness/><FitnessFence/>
 <group name="enlarged-balloon-boarding-platform" position={[balloon.x,heightAt(balloon.x,balloon.z),balloon.z]}><LocalFactory kind="station" options={{scale:STATION_SCALE}}/><group position={[2.35*1.6*STATION_SCALE,.65*STATION_SCALE-.37*BALLOON_SCALE+.12,0]}><group scale={BALLOON_SCALE}><LocalFactory kind="balloon"/></group></group></group>
 {REST_PAVILIONS.map(([x,z],i)=><group key={i} userData={{pavilionId:pavilionIdForSite('rest-'+(i+1))}} position={[x,heightAt(x,z),z]} rotation={[0,site('rest-'+(i+1)).yaw!,0]}><LocalFactory kind="sub" options={{scale:SUB_PAVILION_SCALE}}/></group>)}
 {willowPositions.map(([x,z],i)=><group key={i} position={[x,heightAt(x,z),z]}><LocalFactory kind="willow" options={{seed:42+i,height:8.2+(i%3),spread:4.8}}/></group>)}
 <group name="enlarged-island-pavilion" userData={{pavilionId:'P5'}} position={[LAKE.island.x,4.2,LAKE.island.z]} rotation={[0,-Math.PI/2,0]}><LocalFactory kind="sub" options={{scale:SUB_PAVILION_SCALE}}/></group>
 {[-2.1,2.1].map(dx=><group key={dx} name="moored-duck-boat" position={[site('dock').x+dx,LAKE.y+.08,site('dock').z-3.7]}><Suspense fallback={null}><Model kind="boat"/></Suspense></group>)}
 <FishingPier/><Boats/>
 <group position={[FISHING_SHOP.x,FISHING_SHOP.y+.1,FISHING_SHOP.z]} rotation={[0,FISHING_SHOP.yaw,0]}><LocalFactory kind="fishing-shop"/></group>

 </group>}
function FishingPier(){const d=FISHING_DECK;return <group name="native-fishing-district-no-stone-tables">
 <LocalFactory kind="fishing-deck"/>
 <LocalFactory kind="lake-access"/>
 {[[79.2,-39.7],[79.2,-37.6]].map(([x,z],i)=><group key={i} position={[x!,d.top,z!]} rotation={[0,-Math.PI/2,0]}><LocalFactory kind="rod-rack"/></group>)}
 <group position={[FISHING_NOTICE.x,heightAt(FISHING_NOTICE.x,FISHING_NOTICE.z)+.1,FISHING_NOTICE.z]} rotation={[0,FISHING_NOTICE.yaw,0]}><LocalFactory kind="lake-notice"/></group>
 {FISHING_BENCHES.map(([x,z,yaw],i)=><group key={i} name={'fishing-rest-bench-'+i} position={[x!,FISHING_DECK.top,z!]} rotation={[0,yaw!,0]}><LocalFactory kind="fishing-bench"/></group>)}
 </group>}
function Boats(){
 const boats=useMemo(()=>{const g=new Group();g.name='single-circulating-duck-boat';return[g]},[])
 useFrame(({clock})=>{const t=clock.getElapsedTime();boats.forEach((g,i)=>{const p=boatPose(t*.018+i*Math.PI*2/3,BOAT_ROUTE.x,BOAT_ROUTE.z,BOAT_ROUTE.rx,BOAT_ROUTE.rz);g.position.set(p.x,LAKE.y+.08,p.z);g.rotation.y=p.yaw})})
 return <>{boats.map((g,i)=><primitive key={i} object={g}><Suspense fallback={null}><Model kind="boat"/></Suspense></primitive>)}</>
}

/** Local furniture is kept at human scale even though the tower is stretched to 40 m. */
function TowerFurniture(){const t=site('tower'),floor=facilityGroundY(t)+TOWER_TOP.floor;return <group name="ordered-tower-rim-furniture" position={[t.x,floor,t.z]}>
 {TOWER_TOP.telescopes.map(([x,z],i)=><group key={i} name="inward-looking-telescope" position={[x,.015,z]} rotation={[0,telescopeYaw(t.x+x,t.z+z),0]}><TelescopeModel part="base"/><TelescopeModel part="yoke"/><group position={[0,TELESCOPE.eyeHeight,0]} rotation={[-.35,0,0]}><TelescopeModel part="head"/></group></group>)}
 <group position={[TOWER_TOP.notes[0],.015,TOWER_TOP.notes[1]]} rotation={[0,Math.atan2(-TOWER_TOP.notes[0],-TOWER_TOP.notes[1]),0]}><group position={[-NOTES_BOX.x,-NOTES_BOX.y,-NOTES_BOX.z]}><TraditionalNotesBoard/></group></group>
 {TOWER_TOP.benches.map(([x,z],i)=><ReferenceBench key={i} name={'tower-rest-bench-'+i} position={[x,.015,z]} yaw={Math.atan2(-x,-z)} seatHeight={.56}/>)}
 </group>}
