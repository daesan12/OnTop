import {useMemo,useEffect,useRef,useSyncExternalStore,type RefObject} from 'react'
import {useThree,useFrame} from '@react-three/fiber'
import {OrbitControls} from 'three/addons/controls/OrbitControls.js'
import {BufferGeometry,Float32BufferAttribute,Vector3,PerspectiveCamera,Box3,Group} from 'three'
import {WalkwayMaterial} from '../world/art/WalkwayMaterial'
import {FacetedParkTreeInstances} from '../world/art/FacetedParkTreeInstances'
import {ReferenceBench} from '../world/art/ReferenceBenchFrames'
import {ParkLamps} from '../world/art/ParkFurniture'
import {ParkStoneMaterial} from './ParkStoneMaterial'
import {SUMMIT_OUTLINE,SUMMIT_HEIGHT} from './hybridTerrainPlan'
import {RETAINING_FOOTING_Y} from './siteFinishingPlan'
import {HillsideFinishing} from './HillsideFinishing'
import {factory} from './assetFactories'
import {HorrorZone,syncHorrorRenderGate} from './HorrorZone'
import {HORROR,HORROR_INSPECTION,horrorState,inHorror,setHorrorOpen,subscribeHorror,horrorPortalAt,updateHorrorPresence,safeHorrorCamera} from './horrorPlan'
import {JumpEnclosure} from './JumpEnclosure'

import {MappingMarkers} from './mapping/MappingPanel'
import {DEV_ASSET_MAPPING} from './mapping/catalog'
import {Buildings} from './Buildings'
import {CityBackdrop,ParkEnvironment} from './CityBackdrop'
import {terrain,paving,retaining,lakeWater,lakeShore,lakeBed,forestTrailMeshes,island,islandShore,trees,treeCount,lamps,benches,perimeterPoints,oval,ribbon} from './landscape'
import {SITES,site,heightAt,routeTo,NODES,type Point} from './plan'
import {LakeAndParkDetails} from './LakeAndParkDetails'
import {JumpTenCourse} from './JumpTenCourse'
import {createJumpState,queueJump,stepJump,type JumpState} from './jump10Simulation'
import {ParkBoundary,OriginalPlaza} from './ParkBoundary'
import {GATE} from './boundaryPlan'
import {orientWayfinding} from './wayfindingArt'
import {SIGNPOSTS} from './landscapePlan'
import {canTravel,TRAVEL_PROFILES,type Travel} from './travelMotion'
import {stepRide} from './rideAuditPlan'
import {rideAuditEnabled,rideAudit,finishRide,publishRideAudit} from './RideAuditPanel'
import {parkWalkSurface} from './surfaceHeight'
export type View='panorama'|'overview'|'plan'|'walk'|'tower'|'entrance'|'course'|'jump'
export type {Travel} from './travelMotion'
export interface SceneProps {mappingKey?:string|null;view:View;selected:string|null;night:boolean;labels:boolean;reserve:boolean;route:string|null;travel:Travel;blocked:boolean;jumpStarted:boolean;labelElements:Map<string,HTMLButtonElement>;onReady:()=>void;onPosition:(p:Point,y?:number)=>void}
const lampposts=lamps.map(([x,z])=>[x,heightAt(x,z),z]as const)
const boundaryGeometry=(()=>{const points=perimeterPoints(),p:number[]=[],indices:number[]=[];points.forEach(v=>p.push(v.x,v.y,v.z,v.x,-4,v.z));for(let i=0;i<points.length-1;i++){const k=i*2;indices.push(k,k+2,k+1,k+1,k+2,k+3)}const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(p,3));g.setIndex(indices);g.computeVertexNormals();return g})()
function DirectionSigns(){const objects=useMemo(()=>SIGNPOSTS.map(s=>({s,group:orientWayfinding(factory('sign',s.boards.length===3?{variant:'crossroads',destinations:s.boards.map(b=>({label:b.label,direction:'right'}))}:{variant:'wood-arrow',label:s.boards[0]!.label,direction:'right'}),s)})),[]);return <>{objects.map(({s,group},i)=><group key={i} name={'advance-wayfinding-'+i} userData={{boards:s.boards}} position={[s.x,heightAt(s.x,s.z),s.z]}><primitive object={group} dispose={null}/></group>)}</>}
export function ScenicDetails(){
 return <>
  <mesh geometry={boundaryGeometry} receiveShadow><meshLambertMaterial color="#9caa83" side={2}/></mesh>
  <mesh position={[0,-4.1,0]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[2000,2000]}/><meshLambertMaterial color="#e8e8da"/></mesh>
  <mesh geometry={terrain} receiveShadow><meshLambertMaterial vertexColors/></mesh>
  <mesh name="steep-bank-stone-retaining-faces" geometry={retaining}><ParkStoneMaterial large/></mesh>
  <group name="masonry-retaining-corner-seals">{SUMMIT_OUTLINE.map(([x,z],i)=>{const bottom=RETAINING_FOOTING_Y,top=SUMMIT_HEIGHT+.085;return <mesh key={i} position={[x,(top+bottom)/2,z]}><boxGeometry args={[.2,top-bottom,.2]}/><ParkStoneMaterial large/></mesh>})}</group>
  <mesh geometry={paving} receiveShadow><WalkwayMaterial color="#ffffff"/></mesh>
  {forestTrailMeshes.map(t=><mesh key={t.id} name={t.id} geometry={t.geometry}><meshLambertMaterial color="#acaa84"/></mesh>)}
  <mesh geometry={lakeBed}><meshLambertMaterial color="#597c64"/></mesh>
  <OriginalPlaza/><ParkBoundary/><LakeAndParkDetails/>
  <mesh geometry={lakeShore}><meshLambertMaterial color="#b6b39b" side={2}/></mesh>
  <mesh name="large-lake-water" geometry={lakeWater}><meshPhongMaterial color="#719f99" shininess={55} specular="#c2e0d4" transparent opacity={.68} depthWrite={false}/></mesh>
  <mesh geometry={islandShore}><meshLambertMaterial color="#aeb18a"/></mesh><mesh geometry={island}><meshLambertMaterial color="#859a5d"/></mesh>
  <FacetedParkTreeInstances parts={trees} name="renewal-groves" treeCount={treeCount}/>
  <ParkLamps placements={lampposts}/>
  {benches.map(({point:[x,z],yaw},i)=><ReferenceBench key={i} name={'renewal-bench-'+i} position={[x,heightAt(x,z)+.12,z]} yaw={yaw}/>)}
  <DirectionSigns/><HillsideFinishing/><JumpEnclosure/>

 </>
}
function MarkedAreas({reserve}:{reserve:boolean}){return <>{SITES.filter(s=>s.kind==='reserve'||s.kind==='npc').map(s=><group key={s.id} visible={reserve}>
 <mesh geometry={oval(s.x,s.z,s.radius,s.radius*.8,heightAt(s.x,s.z)+.2)}><meshBasicMaterial color={s.kind==='reserve'?'#d3ac58':'#55888a'} transparent opacity={.3} depthWrite={false}/></mesh>
 </group>)}</>}
function Route({id}:{id:string|null}){
 const geometry=useMemo(()=>id?ribbon(routeTo(id),.65,.35):null,[id]);useEffect(()=>()=>geometry?.dispose(),[geometry])
 return geometry?<mesh name="fortune-navigation-route" geometry={geometry} renderOrder={5}><meshBasicMaterial color="#d3a44b" toneMapped={false} side={2}/></mesh>:null
}
function CameraController(props:SceneProps&{jumpState:RefObject<JumpState>}){
 const {camera,gl,size}=useThree(),controls=useRef<OrbitControls|null>(null),keys=useRef(new Set<string>()),tick=useRef(0),actor=useRef(new Vector3(0,heightAt(...NODES.entry!),NODES.entry![1])),lastView=useRef<View>('overview'),scratch=useMemo(()=>new Vector3(),[])
 const jump=props.jumpState,sentStarted=useRef(false)
 const vehicle=useRef<Group>(null),auditGeneration=useRef(-1),auditTick=useRef(0)
 const auditVehicles=useMemo(()=>rideAuditEnabled?['ebike','kickboard'].map(kind=>{const g=factory(kind),box=new Box3().setFromObject(g);g.position.y=-box.min.y;return g}):[],[])
 const arriveAtHorror=()=>{const c=controls.current,fixture=HORROR_INSPECTION[horrorState.inspect]!,[x,z]=fixture.point,y=parkWalkSurface(x,z);if(c){c.enableDamping=false;c.update()}actor.current.set(x,y,z);camera.position.set(x,y+1.7,z+.3);c?.target.set(fixture.look[0],y+1.7,fixture.look[1]);c?.update();if(c)c.enableDamping=true;updateHorrorPresence(x,z,y);keys.current.clear();horrorState.arrive=false}

 useEffect(()=>{const move=()=>{if(props.view==='walk')arriveAtHorror()};window.addEventListener('park-horror-arrive',move);return()=>window.removeEventListener('park-horror-arrive',move)},[props.view])
 const restartJump=()=>{jump.current=createJumpState();const s=jump.current;actor.current.set(s.x,s.y,s.z);controls.current?.target.set(s.x,s.y+1.2,s.z-1.5);camera.position.set(s.x,s.y+4.8,s.z+7);window.dispatchEvent(new CustomEvent('garden-jump-status',{detail:{stage:s.stage,phase:s.phase,height:s.y,started:s.active,coins:s.coins}}))}
 useEffect(()=>{window.addEventListener('garden-jump-restart',restartJump);return()=>window.removeEventListener('garden-jump-restart',restartJump)},[camera])
 useEffect(()=>{const c=new OrbitControls(camera,gl.domElement);c.enableDamping=true;c.dampingFactor=.08;c.minDistance=3;c.maxDistance=2100;c.maxPolarAngle=Math.PI*.485;c.target.set(0,4,0);controls.current=c;props.onReady();return()=>{c.dispose();controls.current=null}},[camera,gl])
 useEffect(()=>{
  const c=controls.current;if(!c)return;c.enableDamping=false;c.update()
  const portrait=size.width/size.height<.9
  if(camera instanceof PerspectiveCamera){camera.fov=portrait?75:props.view==='jump'?65:40;camera.near=props.view==='walk'||props.view==='jump'?.08:props.view==='tower'?.25:2;camera.updateProjectionMatrix()}
  const fit=Math.max(1,1.2/(size.width/size.height*(portrait?Math.tan(75*Math.PI/360)/Math.tan(40*Math.PI/360):1)))
  const moving=props.view==='walk'||props.view==='jump'
  c.enablePan=!moving;c.minDistance=moving?1:3;c.maxDistance=moving?12:2100
  if(props.view==='jump'){if(!jump.current.active)restartJump();else{const s=jump.current;actor.current.set(s.x,s.y,s.z);c.target.set(s.x,s.y+1.2,s.z-1.5);camera.position.set(s.x,s.y+4.8,s.z+7)}}
  else if(props.view==='course'){camera.position.set(-180*fit,175*fit,200*fit);c.target.set(-10,26,-12)}
  else if(props.view==='walk'){
   const s=props.selected?site(props.selected):null,p=s?NODES[s.node]!:props.view===lastView.current?[actor.current.x,actor.current.z]:NODES.entry!
   actor.current.set(p[0]!,parkWalkSurface(p[0]!,p[1]!),p[1]!);c.target.set(actor.current.x,actor.current.y+1.7,actor.current.z);camera.position.set(actor.current.x,actor.current.y+2.2,actor.current.z+5)
  }else if(!props.selected&&props.view==='entrance'){camera.position.set(0,83,GATE.z+47);c.target.set(0,4,78)}
  else if(!props.selected&&props.view==='tower'){const s=site('tower'),y=heightAt(s.x,s.z)+40;camera.position.set(s.x-10,y+3.3,s.z-8);c.target.set(0,8,-8)}
  else if(props.selected){const s=site(props.selected),h=heightAt(s.x,s.z),r=s.id==='lake'?110:s.id==='tower'?60:Math.max(17,s.radius*2);c.target.set(s.x,h+(s.id==='tower'?23:3),s.z);if(s.id==='plaza'){c.target.set(0,5,27);camera.position.set(0,62,113)}else if(s.id==='tower'){c.target.set(s.x,h+40,s.z);camera.position.set(s.x+15,h+66,s.z+20)}else if(s.id==='pagoda')camera.position.set(-95,80,-1);else if(s.id==='fishing')camera.position.set(s.x-13,h+18,s.z+15);else if(s.id==='dock')camera.position.set(s.x-10,h+18,s.z-17);else camera.position.set(s.x+r*.85,h+r*(s.id.startsWith('rest-')?1.3:.8)+(s.id==='tower'?26:0),s.z+r)}
  else if(props.view==='plan'){camera.position.set(0,355*fit,.01);c.target.set(0,4,0)}
  else if(props.view==='panorama'){if(portrait)camera.position.set(-165,255,245);else camera.position.set(-245*fit,195*fit,325*fit);c.target.set(-5,38,-10)}
  else {camera.position.set(155*fit,180*fit,210*fit);c.target.set(0,7,-2)}
  if(props.view==='walk'&&horrorState.arrive)arriveAtHorror();if(props.view!=='walk')setHorrorOpen(false)
  if(props.mappingKey&&props.view!=='walk'){const r=DEV_ASSET_MAPPING.find(r=>r.key===props.mappingKey);if(r?.position){const [x,y,z]=r.position;c.target.set(x,y+.8,z);camera.position.set(x+6,y+5,z+7)}}
  lastView.current=props.view;c.update();c.enableDamping=true
 },[props.view,props.selected,props.mappingKey,camera,size.width,size.height])
 useEffect(()=>{
  const keyCode=(e:KeyboardEvent)=>e.code||(/^[wasd]$/i.test(e.key)?'Key'+e.key.toUpperCase():e.key===' '?'Space':e.key==='Shift'?'ShiftLeft':e.key)
  const down=(e:KeyboardEvent)=>{if(e.target instanceof HTMLElement&&(e.target.matches('input,textarea,select')||e.target.closest('[role="dialog"]')))return;const code=keyCode(e);if(e.ctrlKey&&e.altKey&&code.startsWith('Arrow')&&props.view==='walk'&&!props.blocked){e.preventDefault();const c=controls.current;if(c){const axes:Record<string,Point>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]},p=axes[code]!;c.enableDamping=false;c.update();camera.position.set(actor.current.x,actor.current.y+1.7,actor.current.z);c.target.set(actor.current.x+p[0]*4,actor.current.y+1.7,actor.current.z+p[1]*4);c.update();c.enableDamping=true}return}if(code==='KeyE'&&!e.repeat&&e.shiftKey&&props.view==='walk'&&!props.blocked&&horrorPortalAt(actor.current.x,actor.current.z)!==undefined){e.preventDefault();setHorrorOpen(inHorror(actor.current.x,actor.current.z)||!horrorState.open)}if(code==='Space'&&props.view==='jump'&&!props.blocked){e.preventDefault();if(!e.repeat)queueJump(jump.current)}if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft'].includes(code)){if((props.view==='walk'||props.view==='jump')&&!props.blocked)e.preventDefault();keys.current.add(code)}}
  const up=(e:KeyboardEvent)=>keys.current.delete(keyCode(e)),clear=()=>keys.current.clear(),move=(e:Event)=>{const d=(e as CustomEvent<{code:string;down:boolean}>).detail;if(d.down){keys.current.add(d.code);if(d.code==='Space'&&props.view==='jump'&&!props.blocked)queueJump(jump.current)}else keys.current.delete(d.code)}
  window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',clear);window.addEventListener('renewal-move',move);document.addEventListener('visibilitychange',clear)
  return()=>{window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',clear);window.removeEventListener('renewal-move',move);document.removeEventListener('visibilitychange',clear)}
 },[props.view,props.blocked])
 useEffect(()=>{keys.current.clear()},[props.blocked,props.view])
 useFrame((_,dt)=>{
  const c=controls.current;if(!c)return;c.update()
  if(props.view==='jump'&&!props.blocked){const k=keys.current,v=(k.has('KeyW')?1:0)-(k.has('KeyS')?1:0),u=(k.has('KeyD')?1:0)-(k.has('KeyA')?1:0);camera.getWorldDirection(scratch);scratch.y=0;scratch.normalize();stepJump(jump.current,dt,{x:scratch.x*v-scratch.z*u,z:scratch.z*v+scratch.x*u,fast:k.has('ShiftLeft')});const s=jump.current,delta=new Vector3(s.x-actor.current.x,s.y-actor.current.y,s.z-actor.current.z);actor.current.set(s.x,s.y,s.z);camera.position.add(delta);c.target.add(delta)}
  const audit=rideAuditEnabled&&props.view==='walk'?rideAudit.run:null
  if(audit&&!props.blocked){
   if(auditGeneration.current!==rideAudit.generation){auditGeneration.current=rideAudit.generation;keys.current.clear()}
   stepRide(audit,dt,parkWalkSurface);actor.current.set(audit.x,audit.y,audit.z)
   const sx=Math.sin(audit.yaw),cz=Math.cos(audit.yaw),length=TRAVEL_PROFILES[audit.travel].halfLength,front=parkWalkSurface(audit.x+sx*length,audit.z+cz*length),back=parkWalkSurface(audit.x-sx*length,audit.z-cz*length)
   if(vehicle.current){vehicle.current.visible=true;vehicle.current.position.set(audit.x,(front+back)/2,audit.z);vehicle.current.rotation.set(-Math.atan2(front-back,2*length),audit.yaw,0,'YXZ');vehicle.current.children.forEach((v,i)=>v.visible=i===(audit.travel==='bicycle'?0:1))}
   c.target.set(audit.x,audit.y+1.2,audit.z);camera.position.set(audit.x-sx*7,audit.y+4.1,audit.z-cz*7);c.update()
   auditTick.current+=dt;if(auditTick.current>.2){publishRideAudit();auditTick.current=0}
   if(audit.complete||audit.blocked)finishRide()
  }else if(vehicle.current)vehicle.current.visible=false
  if(props.view==='walk'&&!props.blocked&&!audit){
   const k=keys.current,v=(k.has('KeyW')||k.has('ArrowUp')?1:0)-(k.has('KeyS')||k.has('ArrowDown')?1:0),u=(k.has('KeyD')||k.has('ArrowRight')?1:0)-(k.has('KeyA')||k.has('ArrowLeft')?1:0)
   if(v||u){camera.getWorldDirection(scratch);scratch.y=0;scratch.normalize();const distance=(props.travel==='walk'&&k.has('ShiftLeft')?7:TRAVEL_PROFILES[props.travel].speed)*Math.min(dt,.05)/Math.hypot(u,v),dx=(scratch.x*v-scratch.z*u)*distance,dz=(scratch.z*v+scratch.x*u)*distance,x=actor.current.x+dx,z=actor.current.z+dz
    if(canTravel([actor.current.x,actor.current.z],[x,z],actor.current.y,props.travel,Math.atan2(dx,dz))){const y=parkWalkSurface(x,z,actor.current.y),dy=y-actor.current.y;actor.current.set(x,y,z);camera.position.add(new Vector3(dx,dy,dz));c.target.add(new Vector3(dx,dy,dz))}
   }
  }
  const underground=props.view==='walk'&&updateHorrorPresence(actor.current.x,actor.current.z,actor.current.y);if(props.view!=='walk'&&horrorState.inside)updateHorrorPresence(0,0,22)
  if(props.view==='walk'&&actor.current.y<HORROR.ceiling+.5){const p=safeHorrorCamera([actor.current.x,actor.current.y+1.7,actor.current.z],[camera.position.x,camera.position.y,camera.position.z],!!underground);camera.position.set(...p)}
  syncHorrorRenderGate(camera.position.x,camera.position.y,camera.position.z,props.view==='walk')
  if(sentStarted.current!==jump.current.active){sentStarted.current=jump.current.active;window.dispatchEvent(new CustomEvent('garden-jump-status',{detail:{stage:jump.current.stage,phase:jump.current.phase,height:jump.current.y,started:jump.current.active,coins:jump.current.coins}}))}
  tick.current+=dt;if(tick.current>.2){tick.current=0;props.onPosition([actor.current.x,actor.current.z],actor.current.y);if(props.view==='jump')window.dispatchEvent(new CustomEvent('garden-jump-status',{detail:{stage:jump.current.stage,phase:jump.current.phase,height:jump.current.y,started:jump.current.active,coins:jump.current.coins}}))}
  const occupied:{x:number;y:number;w:number}[]=[]
  for(const s of SITES){const el=props.labelElements.get(s.id);if(!el)continue;const allowed=!horrorState.inside&&props.labels&&(s.label||s.id===props.selected||props.reserve&&!!s.kind)&&(size.width>650||props.selected===s.id||['plaza','lake','balloon'].includes(s.id));scratch.set(s.x,s.id==='tower'?heightAt(s.x,s.z)+43:heightAt(s.x,s.z)+(s.kind?1.5:s.id==='pagoda'?36:s.id==='lake'?2:9),s.z).project(camera);const x=(scratch.x*.5+.5)*size.width,y=(-scratch.y*.5+.5)*size.height,w=s.name.length*10+20;const overlap=occupied.some(r=>Math.abs(r.x-x)<(r.w+w)/2+6&&Math.abs(r.y-y)<32);const shown=allowed&&scratch.z<1&&scratch.z>-1&&x>w/2&&x<size.width-w/2&&y>90&&y<size.height-90&&(!overlap||props.selected===s.id);el.style.display=shown?'block':'none';if(shown){el.style.transform=`translate(${x}px,${y}px) translate(-50%,-100%)`;occupied.push({x,y,w})}}
 })
 return rideAuditEnabled?<group ref={vehicle} name="local-ride-audit-vehicle" visible={false}>{auditVehicles.map((g,i)=><group key={i}><primitive object={g} dispose={null}/></group>)}</group>:null
}
export default function Scene(props:SceneProps){
 const jumpState=useRef(createJumpState())
 const underground=useSyncExternalStore(subscribeHorror,()=>horrorState.inside)
 return <>
  <ParkEnvironment night={props.night||underground}/><group name="surface-city-hidden-underground" visible={!underground}><CityBackdrop/></group>
  <directionalLight position={[-100,190,90]} intensity={underground?.04:props.night?.65:2.2} color={props.night?'#b5cacc':'#fff0d6'}/>
  <group name="surface-park-hidden-underground" visible={!underground}><ScenicDetails/><Buildings/><MappingMarkers selected={props.mappingKey??null}/><JumpTenCourse stateRef={jumpState} started={props.jumpStarted} preview={props.view==='course'}/><MarkedAreas reserve={props.reserve}/><Route id={props.route}/></group><HorrorZone/><CameraController {...props} jumpState={jumpState}/>
 </>
}
