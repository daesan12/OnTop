import {electricBicycle,rentalBay} from './rentalAssets.js'
import {groundSurfaceHeight} from './groundSurface.ts'
// This bridge consumes independently authored JS assets without editing their sources.
import {createSubPavilion} from './approved/서브팔각정_1/asset.js'
import {createPreviewWillow} from './previewWillow.js'
import {createLowPolyBalloon} from './approved/열기구_로우폴리_1/asset.js'
import {createLowPolyStation} from './approved/탑승장_로우폴리_1/asset.js'
import {createBicycleRentalStation} from './approved/자전거대여소_1/asset.js'
import {createScooterRentalStation} from './approved/킥보드대여소_1/asset.js'
import {createWayfindingSign} from './approved/이동_푯말/asset.js'
import {createBicycle} from './approved/자전거_1/asset.js'
import {createScooter} from './approved/자전거_1/src/vehicles.js'
import {createTraditionalPlayZone,createTraditionalPlaySignTexture,createYutMatTexture} from './approved/전통놀이존_1/asset.js'
import {Mesh,BoxGeometry,CylinderGeometry,MeshLambertMaterial} from 'three'
import {createShootingRange,createShootingRangeSignTexture} from './approved/사격장_1/asset.js'
import {createFishingLakeProp} from './approved/대형_호수_낚시터/asset.js'
import {Builder as LakeBuilder} from './approved/대형_호수_낚시터/src/primitives.js'
import {boardwalk,footprint} from './approved/대형_호수_낚시터/src/connections.js'
import {post,rope} from './approved/대형_호수_낚시터/src/props.js'
import {BRIDGE,BRIDGE_LANDINGS,bridgeDeckHeight,LAKE,heightAt,DOCK_ACCESS,FISHING_ACCESS,FISHING_OUTLINE,FISHING_DECK,FISHING_UPPER,FISHING_STAIRS,FISHING_SUPPORTS,STATION_SHELTER,STATION_STAIRS,STATION_SCALE,fishingRailSections,accessTopAt} from './plan.ts'
import {stripePolygon} from './roundedFootprint.ts'
import {groundObject} from './assetSizing.ts'
import {bridgeApproachGuards,lakeFenceSegments} from './lakePlan.ts'
import {cloneBakedFacility} from './static/facilities.ts'
import {DOCK_REAR_RAIL} from './dockRailPlan.ts'
function islandBridge(){
 const b=new LakeBuilder('light'),n=Math.ceil((BRIDGE.x1-BRIDGE.x0)/.26)
 for(let i=0;i<n;i++){
  const x0=BRIDGE.x0+(BRIDGE.x1-BRIDGE.x0)*i/n,x1=BRIDGE.x0+(BRIDGE.x1-BRIDGE.x0)*(i+1)/n
  const side=BRIDGE.width/2
  footprint(b,[[x0+.004,BRIDGE.z-side],[x1-.004,BRIDGE.z-side],[x1-.004,BRIDGE.z+side],[x0+.004,BRIDGE.z+side]],.2,.18,'wood',i%2?'#b77e44':'#c18a4e')
 }
 for(const side of[-1,1]){const n=Math.ceil((BRIDGE.x1-BRIDGE.x0)/1.55);for(let i=0;i<=n;i++){const x=BRIDGE.x0+(BRIDGE.x1-BRIDGE.x0)*i/n,z=BRIDGE.z+side*BRIDGE.width/2;post(b,x,z,.2);if(i)for(const h of[.48,.92])rope(b,[x-(BRIDGE.x1-BRIDGE.x0)/n,.2+h,z],[x,.2+h,z])}}
 const group=b.finish('retained-fishing-boardwalk-arched-bridge');group.traverse(o=>{if(!o.isMesh)return;const p=o.geometry.attributes.position;for(let i=0;i<p.count;i++)p.setY(i,p.getY(i)+bridgeDeckHeight(p.getX(i))-.2);o.geometry.computeVertexNormals();o.geometry.computeBoundingBox();o.geometry.computeBoundingSphere()})
 for(const x of BRIDGE.pierX)for(const side of[-1,1]){const top=bridgeDeckHeight(x)-.19,bottom=LAKE.y-.3,pier=new Mesh(new BoxGeometry(.65,top-bottom,.65),new MeshLambertMaterial({color:'#aba994'}));pier.name='inset-bridge-support';pier.position.set(x,(top+bottom)/2,BRIDGE.z+side*1.08);group.add(pier)}
 const stone = new LakeBuilder('light')
 // The island landing sits on the island itself. Draw its existing grass
 // surface continuously under the approach while retaining the walkable grade.
 const {x0,x1,top,width}=BRIDGE_LANDINGS[0],side=(width-.04)/2
 footprint(stone,[[x0,BRIDGE.z-side],[x1,BRIDGE.z-side],[x1,BRIDGE.z+side],[x0,BRIDGE.z+side]],top,.55,'stone','#bcb9a8')
 group.add(stone.finish('west-bridge-stone-abutment'))
 return{group}
}
function shoreFence(segments,name){const b=new LakeBuilder('light');for(const{a,z}of segments){const ya=groundSurfaceHeight(...a)+.015,yz=groundSurfaceHeight(...z)+.015;post(b,...a,ya);post(b,...z,yz);for(const h of[.48,.92])rope(b,[a[0],ya+h,a[1]],[z[0],yz+h,z[1]])}return{group:b.finish(name)}}
function lakeFence(){return shoreFence(lakeFenceSegments(),'retained-lake-shore-rope-fence')}
function bridgeGuards(){return shoreFence(bridgeApproachGuards(),'island-bridge-approach-guards')}
function lakeAccess(){
 const groups=[]
 for(const a of[DOCK_ACCESS,FISHING_ACCESS]){
  const dock=a===DOCK_ACCESS,b=new LakeBuilder('light')
  boardwalk(b,{points:a.points,width:a.width,top:a.top,continuousDeck:dock})
  const g=b.finish('graded-single-wood-access')
  if(dock)g.userData.keepOpaque=true
  g.traverse(o=>{
   if(!o.isMesh)return
   const p=o.geometry.attributes.position
   for(let i=0;i<p.count;i++){
    const x=p.getX(i),z=p.getZ(i),y=p.getY(i)
    // The access and GLB planks share the same finished height. Recess the
    // timber joint under the GLB bevel without changing the walkable grade.
    const joint=dock?Math.max(0,Math.min(1,(x-(a.points[2][0]-.35))/.25))*.018:0
    p.setY(i,y+accessTopAt(a,x,z)-a.top-joint)
   }
   o.geometry.computeVertexNormals();o.geometry.computeBoundingBox();o.geometry.computeBoundingSphere()
  })
  groups.push(g)
 }
 const root=new LakeBuilder('light').finish('native-wood-access-bridges');root.add(...groups);return root
}
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
export function factory(kind,options={}){
 if(!Object.keys(options).length){
  const baked=cloneBakedFacility(kind)
  if(baked)return baked
 }
 if(kind==='rental-bay')return rentalBay(options)

 if(kind==='lake-access')return lakeAccess()
 if(kind==='dock-rear-rail'){
  const b=new LakeBuilder('light'),{z,posts,ropeHeights,supportHeight,westReturn}=DOCK_REAR_RAIL
  const x=posts[0]
  for(const [px,pz] of [[x,z],westReturn]){
   b.box('wood','#b07a47',[px,.65+supportHeight/2,pz],[.22,supportHeight,.22])
   b.box('wood','#ce9c62',[px,.65+supportHeight,pz],[.31,.11,.31])
   b.box('wood','#704b30',[px,.69,pz],[.30,.12,.30])
  }
  const dockRope='#dfcd9f'
  for(const y of ropeHeights)rope(b,[westReturn[0],y,westReturn[1]],[x,y,z],0,dockRope)
  for(let i=1;i<posts.length;i++)for(const y of ropeHeights)rope(b,[posts[i-1],y,z],[posts[i],y,z],0,dockRope)
  const rail=b.finish('duck-dock-rear-rail')
  rail.traverse(mesh=>{if(mesh.isMesh)mesh.material.roughness=.73})
  return rail
 }
 if(kind==='fishing-deck')return fishingDeck()
 if(kind==='fishing-bench')return createFishingLakeProp('bench',{quality:'light'}).group

 if(kind==='shooting')return createShootingRange({...options,quality:'light',signTexture:options.plain?undefined:createShootingRangeSignTexture()}).group
 if(kind==='folk')return createTraditionalPlayZone({...options,quality:'light',signTexture:options.plain?undefined:createTraditionalPlaySignTexture(),matTexture:options.plain?undefined:createYutMatTexture()}).group
 if(kind==='fishing-shop'||kind==='rod-rack'||kind==='lake-notice')return createFishingLakeProp(kind==='fishing-shop'?'tackle-shop':kind==='lake-notice'?'notice-board':'rod-rack',{quality:'light'}).group
 const factories={bridge:islandBridge,'lake-fence':lakeFence,'bridge-guards':bridgeGuards,ebike:electricBicycle,sub:createSubPavilion,willow:createPreviewWillow,balloon:createLowPolyBalloon,station:createLowPolyStation,bike:createBicycleRentalStation,scooter:createScooterRentalStation,sign:createWayfindingSign,bicycle:createBicycle,kickboard:createScooter}
 const indigo='#304a65'
 const appearance=kind==='balloon'?{decoration:'simple',accent:indigo,cream:'#e6d6b7'}:
  kind==='station'?{deckAccent:indigo,includeBench:false,entranceTreads:false}:{}
 const group=factories[kind]({...options,...appearance,quality:'light'}).group
 if(kind==='station'){
  const b=new LakeBuilder('light'),s=STATION_STAIRS,top=s.top/STATION_SCALE,run=(s.zBottom-s.zTop)/STATION_SCALE/s.steps
  for(let i=0;i<s.steps;i++){const y=(i+1)/s.steps*top;b.box('stone',i%2?'#c0b6a0':'#b3ad9f',[0,y/2,s.zBottom/STATION_SCALE-(i+.5)*run],[s.width/STATION_SCALE,y,run+.002])}
  const shelter=STATION_SHELTER, start=shelter.z+shelter.depth/2, rise=shelter.floor-s.top
  const pitch=Math.atan2(rise,shelter.entryRun),length=Math.hypot(rise,shelter.entryRun)
  b.box('wood','#b28b59',[shelter.x/STATION_SCALE,(s.top+rise/2-.04*Math.cos(pitch))/STATION_SCALE,
    (start+shelter.entryRun/2-.04*Math.sin(pitch))/STATION_SCALE],
    [shelter.entryWidth/STATION_SCALE,.08/STATION_SCALE,length/STATION_SCALE],[pitch,0,0])
  group.add(b.finish('boarding-treads-and-shelter-approach'))
 }
 // The approved envelope has inward-facing panels. Keep the package intact and
 // show both sides on this local instance so its exterior remains visible.
 if(kind==='balloon'){
  const baseFloorY=.425,floorY=options.cabinFloorY??baseFloorY
  const raised=floorY>baseFloorY
  const radius=raised?1.77:1.69,thickness=raised?floorY-baseFloorY:.07
  const floor=new Mesh(new CylinderGeometry(radius,radius,thickness,12),new MeshLambertMaterial({color:'#b5844e'}))
  floor.position.y=floorY-thickness/2
  floor.name='solid-timber-passenger-floor'
  floor.receiveShadow=raised
  group.add(floor)
  for(const z of[-1.2,-.6,0,.6,1.2]){
   const length=2*Math.sqrt(1.68**2-z*z)
   const seam=new Mesh(new BoxGeometry(length,.008,.018),new MeshLambertMaterial({color:'#855b35'}))
   seam.position.set(0,floorY+.003,z)
   seam.name='passenger-floor-seam'
   seam.receiveShadow=raised
   group.add(seam)
  }
  for(let i=1;i<=4;i++){
   const slot=group.getObjectByName('passenger-slot-'+i)
   if(slot)slot.position.y=floorY
  }
  group.userData.cabin={...group.userData.cabin,floorY}
 }
 if(kind==='balloon')group.traverse(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material])m.side=2})
 return group
}
export {rentalLabel} from './rentalAssets.js'
