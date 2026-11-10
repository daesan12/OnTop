import {groundSurfaceHeight} from './groundSurface.ts'
// This bridge consumes independently authored JS assets without editing their sources.
import {createSubPavilion} from './approved/서브팔각정_1/asset.js'
import {createLowPolyWillow} from './approved/버드나무_로우폴리_1/asset.js'
import {createLowPolyBalloon} from './approved/열기구_로우폴리_1/asset.js'
import {createLowPolyStation} from './approved/탑승장_로우폴리_1/asset.js'
import {createBicycleRentalStation,createRentalSignTexture} from './approved/자전거대여소_1/asset.js'
import {createScooterRentalStation} from './approved/킥보드대여소_1/asset.js'
import {createWayfindingSign} from './approved/이동_푯말/asset.js'
import {createBicycle} from './approved/자전거_1/asset.js'
import {createScooter} from './approved/킥보드_1/asset.js'
import {createTraditionalPlayZone,createTraditionalPlaySignTexture,createYutMatTexture} from './approved/전통놀이존_1/asset.js'
import {Mesh,BoxGeometry,CylinderGeometry,MeshLambertMaterial,Vector3} from 'three'
import {createShootingRange,createShootingRangeSignTexture} from './approved/사격장_1/asset.js'
import {createFishingLakeProp} from './approved/대형_호수_낚시터/asset.js'
import {Builder as LakeBuilder} from './approved/대형_호수_낚시터/src/primitives.js'
import {boardwalk,footprint} from './approved/대형_호수_낚시터/src/connections.js'
import {post,rope} from './approved/대형_호수_낚시터/src/props.js'
import {BRIDGE,BRIDGE_LANDINGS,bridgeDeckHeight,LAKE,heightAt,DOCK_ACCESS,FISHING_ACCESS,FISHING_OUTLINE,FISHING_DECK,FISHING_UPPER,FISHING_STAIRS,FISHING_SUPPORTS,STATION_STAIRS,STATION_SCALE,fishingRailSections,accessTopAt} from './plan.ts'
import {stripePolygon} from './roundedFootprint.ts'
import {groundObject} from './assetSizing.ts'
import {lakeFenceSegments} from './lakePlan.ts'
function electricBicycle(options){const result=createBicycle(options),battery=new Mesh(new BoxGeometry(.13,.32,.15),new MeshLambertMaterial({color:'#343e38'}));battery.position.set(0,.66,-.27);battery.rotation.x=-.24;result.group.add(battery);const hub=new Mesh(new CylinderGeometry(.105,.105,.15,12),new MeshLambertMaterial({color:'#687469'}));hub.rotation.z=Math.PI/2;hub.position.set(0,.35,-.64);result.group.add(hub);const display=new Mesh(new BoxGeometry(.1,.025,.065),new MeshLambertMaterial({color:'#476d5b'}));display.position.set(0,1.15,.45);result.group.add(display);return result}
function islandBridge(){
 const b=new LakeBuilder('light'),n=Math.ceil((BRIDGE.x1-BRIDGE.x0)/.26)
 for(let i=0;i<n;i++){const x0=BRIDGE.x0+(BRIDGE.x1-BRIDGE.x0)*i/n,x1=BRIDGE.x0+(BRIDGE.x1-BRIDGE.x0)*(i+1)/n;footprint(b,[[x0,BRIDGE.z-BRIDGE.width/2],[x1,BRIDGE.z-BRIDGE.width/2],[x1,BRIDGE.z+BRIDGE.width/2],[x0,BRIDGE.z+BRIDGE.width/2]],.174,.16,'wood','#805b36');footprint(b,[[x0+.003,BRIDGE.z-BRIDGE.width/2],[x1-.003,BRIDGE.z-BRIDGE.width/2],[x1-.003,BRIDGE.z+BRIDGE.width/2],[x0+.003,BRIDGE.z+BRIDGE.width/2]],.2,.038,'wood',i%2?'#b77e44':'#c18a4e')}
 for(const side of[-1,1]){const n=Math.ceil((BRIDGE.x1-BRIDGE.x0)/1.55);for(let i=0;i<=n;i++){const x=BRIDGE.x0+(BRIDGE.x1-BRIDGE.x0)*i/n,z=BRIDGE.z+side*BRIDGE.width/2;post(b,x,z,.2);if(i)for(const h of[.48,.92])rope(b,[x-(BRIDGE.x1-BRIDGE.x0)/n,.2+h,z],[x,.2+h,z])}}
 const group=b.finish('retained-fishing-boardwalk-arched-bridge');group.traverse(o=>{if(!o.isMesh)return;const p=o.geometry.attributes.position;for(let i=0;i<p.count;i++)p.setY(i,p.getY(i)+bridgeDeckHeight(p.getX(i))-.2);o.geometry.computeVertexNormals();o.geometry.computeBoundingBox();o.geometry.computeBoundingSphere()})
 for(const x of BRIDGE.pierX)for(const side of[-1,1]){const top=bridgeDeckHeight(x)-.19,bottom=LAKE.y-.3,pier=new Mesh(new BoxGeometry(.65,top-bottom,.65),new MeshLambertMaterial({color:'#aba994'}));pier.name='inset-bridge-support';pier.position.set(x,(top+bottom)/2,BRIDGE.z+side*1.08);group.add(pier)}
 for(const l of BRIDGE_LANDINGS){const slab=new Mesh(new BoxGeometry(l.x1-l.x0,.18,l.width-.04),new MeshLambertMaterial({color:'#bcb9a8'}));slab.name='flush-bridge-stone-abutment';slab.position.set((l.x0+l.x1)/2,l.top-.09,BRIDGE.z);group.add(slab)}return{group}
}
function lakeFence(){const b=new LakeBuilder('light');for(const{a,z}of lakeFenceSegments()){const ya=groundSurfaceHeight(...a)+.015,yz=groundSurfaceHeight(...z)+.015;post(b,...a,ya);post(b,...z,yz);for(const h of[.48,.92])rope(b,[a[0],ya+h,a[1]],[z[0],yz+h,z[1]])}return{group:b.finish('retained-lake-shore-rope-fence')}}
function lakeAccess(){const groups=[];for(const a of[DOCK_ACCESS,FISHING_ACCESS]){const b=new LakeBuilder('light');boardwalk(b,{points:a.points,width:a.width,top:a.top});const g=b.finish('graded-single-wood-access');g.traverse(o=>{if(!o.isMesh)return;const p=o.geometry.attributes.position;for(let i=0;i<p.count;i++)p.setY(i,p.getY(i)+accessTopAt(a,p.getX(i),p.getZ(i))-a.top);o.geometry.computeVertexNormals();o.geometry.computeBoundingBox();o.geometry.computeBoundingSphere()});groups.push(g)}const root=new LakeBuilder('light').finish('native-wood-access-bridges');root.add(...groups);return root}
function fishingDeck(){
 const b=new LakeBuilder('light')
 for(const[outline,top]of[[FISHING_OUTLINE,FISHING_DECK.top],[FISHING_UPPER.outline,FISHING_UPPER.top]]){
  footprint(b,outline,top-.026,.17,'wood','#805b36')
  for(let z=-51,i=0;z<-34;z+=.26,i++){const p=stripePolygon(outline,z+.006,z+.254);if(p.length>=3)footprint(b,p,top,.038,'wood',i%2?'#b77e44':'#c18a4e')}
 }
 for(const[x,z]of FISHING_SUPPORTS.upper)b.cylinder('wood','#71502e',[x,(FISHING_UPPER.top-.21+3.1)/2,z],.15,.18,FISHING_UPPER.top-.21-3.1,[0,0,0],10)
 for(const[x,z]of FISHING_SUPPORTS.lower)b.cylinder('wood','#71502e',[x,(FISHING_DECK.top-.21+3.1)/2,z],.15,.18,FISHING_DECK.top-.21-3.1,[0,0,0],10)
 const s=FISHING_STAIRS,run=(s.zBottom-s.zTop)/s.steps
 for(let i=0;i<s.steps;i++){const top=s.bottom+(i+1)/s.steps*(s.top-s.bottom);b.box('wood',i%2?'#b77e44':'#c18a4e',[s.x,(top+s.bottom-.15)/2,s.zBottom-(i+.5)*run],[s.width,top-s.bottom+.15,run+.008])}
 const posts=new Set(),rails=fishingRailSections();let lastPost=null
 const putPost=(p,y)=>{const key=p.map(v=>v.toFixed(4)).join(',')+','+y.toFixed(4);if(!posts.has(key)){post(b,p[0],p[1],y);posts.add(key)}lastPost=[p[0],y,p[1]]}
 for(let i=0;i<rails.length;i++){const r=rails[i],previous=rails[i-1],next=rails[i+1],joined=previous&&Math.hypot(previous.b[0]-r.a[0],previous.b[1]-r.a[1],previous.endFloor-r.floor)<.01
  if(!joined||!lastPost||Math.hypot(r.a[0]-lastPost[0],r.floor-lastPost[1],r.a[1]-lastPost[2])>1.35)putPost(r.a,r.floor)
  if(!next||Math.hypot(next.a[0]-r.b[0],next.a[1]-r.b[1],next.floor-r.endFloor)>.01)putPost(r.b,r.endFloor)
  for(const h of[.48,.92])rope(b,[r.a[0],r.floor+h,r.a[1]],[r.b[0],r.endFloor+h,r.b[1]])
 }
 const g=b.finish('approved-fishing-deck');g.userData.levels=2;return g
}
function rentalBay({kind='bicycle',...options}={}){
 const station=groundObject((kind==='bicycle'?createBicycleRentalStation:createScooterRentalStation)(options).group)
 station.updateMatrixWorld(true)
 for(let i=1;i<=3;i++){
  const dock=station.getObjectByName(kind+'-wheel-dock-'+i),bay=station.getObjectByName(kind+'-parking-bay-'+i),vehicle=groundObject((kind==='bicycle'?electricBicycle:createScooter)({quality:'light'}).group)
  const dockPoint=dock.position,bayY=bay.position.y,front=vehicle.getObjectByName(kind==='bicycle'?'bicycle-front-wheel':'scooter-front-wheel')
  vehicle.updateMatrixWorld(true);const wheel=front.getWorldPosition(new Vector3());vehicle.position.x+=dockPoint.x-wheel.x;vehicle.position.z+=dockPoint.z-wheel.z;vehicle.position.y+=bayY+.006;vehicle.name=kind+'-parked-vehicle-'+i;station.add(vehicle)
 }
 station.userData.parkingContact='native-floor-and-front-wheel-anchors';return station
}
export function factory(kind,options={}){
 if(kind==='rental-bay')return rentalBay(options)

 if(kind==='dock-rear-floor'){const g=new LakeBuilder('light');g.box('wood','#805b36',[0,.627,1.7],[8.72,.08,1.45]);for(let i=0;i<36;i++)g.box('wood',i%3?'#b57f47':'#c18b50',[(i-17.5)*.242,.659,1.7],[.24,.055,1.45]);return g.finish('continuous-timber-rear-walkway')}
 if(kind==='lake-access')return lakeAccess()
 if(kind==='fishing-deck')return fishingDeck()
 if(kind==='fishing-bench')return createFishingLakeProp('bench',{quality:'light'}).group

 if(kind==='shooting')return createShootingRange({...options,quality:'light',signTexture:options.plain?undefined:createShootingRangeSignTexture()}).group
 if(kind==='folk')return createTraditionalPlayZone({...options,quality:'light',signTexture:options.plain?undefined:createTraditionalPlaySignTexture(),matTexture:options.plain?undefined:createYutMatTexture()}).group
 if(kind==='fishing-shop'||kind==='rod-rack'||kind==='lake-notice')return createFishingLakeProp(kind==='fishing-shop'?'tackle-shop':kind==='lake-notice'?'notice-board':'rod-rack',{quality:'light'}).group
 const factories={bridge:islandBridge,'lake-fence':lakeFence,ebike:electricBicycle,sub:createSubPavilion,willow:createLowPolyWillow,balloon:createLowPolyBalloon,station:createLowPolyStation,bike:createBicycleRentalStation,scooter:createScooterRentalStation,sign:createWayfindingSign,bicycle:createBicycle,kickboard:createScooter}
 const group=factories[kind]({...options,quality:'light'}).group
 if(kind==='station'){
  // Replace only the three source entrance tread boxes on this private instance.
  group.traverse(o=>{if(!o.isMesh)return;const g=o.geometry,p=g.getAttribute('position'),index=g.getIndex(),n=index?.count??p.count,keep=[];for(let i=0;i<n;i+=3){const ids=[0,1,2].map(k=>index?index.getX(i+k):i+k);if(ids.every(j=>Math.abs(p.getX(j))<1.4&&p.getZ(j)>5.3&&p.getY(j)<.64))continue;keep.push(...ids)}if(keep.length<n){o.geometry=g.clone();o.geometry.setIndex(keep);o.geometry.computeBoundingSphere()}})
  const b=new LakeBuilder('light'),s=STATION_STAIRS,top=s.top/STATION_SCALE,run=(s.zBottom-s.zTop)/STATION_SCALE/s.steps
  for(let i=0;i<s.steps;i++){const y=(i+1)/s.steps*top;b.box('stone',i%2?'#c0b6a0':'#b3ad9f',[0,y/2,s.zBottom/STATION_SCALE-(i+.5)*run],[s.width/STATION_SCALE,y,run+.002])}
  group.add(b.finish('six-flush-boarding-treads'))
 }
 // The approved envelope has inward-facing panels. Keep the package intact and
 // show both sides on this local instance so its exterior remains visible.
 if(kind==='balloon'){
 const floor=new Mesh(new CylinderGeometry(1.69,1.69,.07,12),new MeshLambertMaterial({color:'#b5844e'}));floor.position.y=.39;floor.name='solid-timber-passenger-floor';group.add(floor)
 for(const z of[-1.2,-.6,0,.6,1.2]){const length=2*Math.sqrt(1.68**2-z*z),seam=new Mesh(new BoxGeometry(length,.008,.018),new MeshLambertMaterial({color:'#855b35'}));seam.position.set(0,.428,z);group.add(seam)}
 for(let i=1;i<=4;i++){const p=group.getObjectByName('passenger-slot-'+i);if(p)p.position.y=.425}group.userData.cabin={...group.userData.cabin,floorY:.425}
 }
 if(kind==='balloon')group.traverse(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material])m.side=2})
 return group
}
export function rentalLabel(kind){return createRentalSignTexture(kind)}
