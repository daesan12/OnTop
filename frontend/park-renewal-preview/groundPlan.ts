import {staticPark} from './static/store'
import {PARK,SITES,LAKE,onLakeFenceBelt,insidePark,inLake,onRoad,parkRadius,footprintDistance,BRIDGE,BRIDGE_LANDINGS,DOCK_ACCESS,FISHING_ACCESS,onFishingDeck,onSquareEndedPath,site,EDGES,NODES,distanceToSegment,MONUMENT_STAIRS,STATION_STEPS,STATION_APPROACH,underStation,onTowerAccess,onEntrancePath,type Point} from './plan.ts'
import {inSummit,onSummitEdge} from './hybridTerrainPlan.ts'
import {REMOVED_POCKET,HUB_TREE_ISLAND,SOUTH_CLUSTER_GROVE,FOLK_FRONT_GROVE,CAFE_CURVE,inEllipse} from './landscapeRefinementPlan.ts'
import {plantingRevision} from './siteFinishingPlan.ts'

export const FLOOR_Y_OFFSET=.085
export const plantedBeds=[{x:-35,z:77,rx:8,rz:10},{x:36,z:73,rx:8,rz:10},{x:-34,z:-9,rx:6,rz:12},{x:-80,z:-60,rx:10,rz:7},{x:-41,z:-78,rx:8,rz:13},{x:12,z:-47,rx:6,rz:9},{x:-52,z:58,rx:6,rz:7},{x:84,z:64,rx:6,rz:9},{x:20,z:-78,rx:7,rz:8}]
export function inBed(x:number,z:number){return plantedBeds.some(b=>((x-b.x)/b.rx)**2+((z-b.z)/b.rz)**2<1)||SITES.some(s=>s.kind==='reserve'&&Math.hypot(x-s.x,z-s.z)<s.radius)}
export function entranceForecourt(x:number,z:number){return distanceToSegment(x,z,[0,101],[0,PARK.rz*parkRadius(Math.PI/2)+4])<7}
/** Vegetation is the explicit exception; public movement and facility aprons use stone. */
// Stop stone surfacing at the timber entrance; grass borders the deck instead of a second narrow path.
const besideWood=(x:number,z:number)=>[DOCK_ACCESS,FISHING_ACCESS].some(a=>a.points.slice(1).some((b,i)=>onSquareEndedPath(x,z,a.points[i]!,b,a.width+1.6)))&&!EDGES.some(([a,b,w])=>distanceToSegment(x,z,NODES[a]!,NODES[b]!)<w/2+.05)
const revisedPublicApron=(x:number,z:number)=>distanceToSegment(x,z,[-53,66],[-49,78])<2.5
// Open a compact turning court while retaining the lake-side woodland strip.
const dockTowerCourt=(x:number,z:number)=>x>72&&x<86&&z>22&&z<34&&distanceToSegment(x,z,[74,29],[84,31])<3.7
function rawPlantingGround(x:number,z:number){
 const revision=plantingRevision(x,z);if(revision!==undefined)return revision
 if(onLakeFenceBelt(x,z))return true
 // Open the folk forecourt and tower turning apron; retain only the lake-side planting belt.
 if(revisedPublicApron(x,z)||dockTowerCourt(x,z))return false
 // Reserve a continuous planted verge against the eastern wall, outside the six-metre road.
 if(x>98&&z> -58&&z< -14&&!onRoad(x,z,.45))return true
 if(!insidePark(x,z,4.2)&&insidePark(x,z,1.8)&&onRoad(x,z,.05))return false
 if(!entranceForecourt(x,z)&&!insidePark(x,z,4.2))return true
 if(besideWood(x,z))return true
 if(onSquareEndedPath(x,z,STATION_APPROACH.a,STATION_APPROACH.b,STATION_APPROACH.width))return false
 const stage=site('balloon'),sx=Math.abs(x-stage.x),sz=z-stage.z;if(sx<STATION_STEPS.halfX+.8&&sz>STATION_STEPS.z0-.5&&sz<STATION_STEPS.z1+.8&&!onRoad(x,z,.05))return true
 if(onTowerAccess(x,z)||onEntrancePath(x,z))return false
 // A planted shoulder separates neighbouring ramp legs; paving never suggests a shortcut over the drop.
 if(x< -58&&z<0&&!onRoad(x,z,1.2))return true
 if(!inSummit(x,z)&&onSummitEdge(x,z,1.1)&&!onRoad(x,z,.1))return true
 if(!inLake(x,z)&&inLake(x,z,1.1)&&!onRoad(x,z,.15))return true
 if(SITES.some(s=>!s.kind&&s.radius&&!['plaza','pavilion','fitness','fountain','pagoda','jump','dock','island-pavilion','fishing'].includes(s.id)&&footprintDistance(s,x,z)<.85))return true
 if(inEllipse(x,z,REMOVED_POCKET))return false
 if([HUB_TREE_ISLAND,SOUTH_CLUSTER_GROVE,FOLK_FRONT_GROVE].some(e=>inEllipse(x,z,e))&&!onRoad(x,z,.05))return true
 // Keep the original octagonal plinth on grass, with a continuous stone apron around it.
 const main=site('pavilion'),mx=Math.abs(x-main.x),mz=Math.abs(z-main.z)
 if(footprintDistance(main,x,z)<.05)return true
 if(Math.hypot(mx,mz)<17.8)return false
 const gym=site('fitness'),gx=x-gym.x,gz=z-gym.z
 if((gx/17.1)**2+(gz/13.1)**2<1&&(gx/15.2)**2+(gz/11.2)**2>1&&Math.abs(gx)>2.55&&Math.abs(gz)>2.55)return true
 // The preserved circular plaza stays continuous; side planting banks begin outside its rim.
 if(Math.hypot(x-site('plaza').x,z-site('plaza').z)<21.4)return false
 if(x>=BRIDGE.x0&&x<=BRIDGE.x1&&Math.abs(z-BRIDGE.z)<BRIDGE.width/2+.15)return true
 if(entranceForecourt(x,z)||onRoad(x,z,.5))return false
 if(x>8&&x<26&&z>-14&&z<0)return inEllipse(x,z,CAFE_CURVE)
 if(SITES.some(s=>s.id==='plaza'&&Math.hypot(x-s.x,z-s.z)<(s.id==='plaza'?20.6:14)))return false
 return true
}
// A cached circular coverage field rounds planting-bank corners without reducing the road core.
const ROUND_GRID={x0:-124,z0:-128,w:249,h:257}
let roundedField:Float32Array|undefined=staticPark?.plantingField
function roundedCoverage(x:number,z:number){
 const {x0,z0,w,h}=ROUND_GRID
 if(!roundedField){const raw=new Float32Array(w*h),horizontal=new Float32Array(w*h),out=new Float32Array(w*h);for(let i=0;i<w;i++)for(let j=0;j<h;j++)raw[i*h+j]=rawPlantingGround(x0+i,z0+j)?1:0;const weights=[1,8,28,56,70,56,28,8,1];for(let i=0;i<w;i++)for(let j=0;j<h;j++){let v=0;for(let k=-4;k<=4;k++)v+=weights[k+4]!*raw[Math.max(0,Math.min(w-1,i+k))*h+j]!;horizontal[i*h+j]=v/256}for(let i=0;i<w;i++)for(let j=0;j<h;j++){let v=0;for(let k=-4;k<=4;k++)v+=weights[k+4]!*horizontal[i*h+Math.max(0,Math.min(h-1,j+k))]!;out[i*h+j]=v/256}roundedField=out}
 const xx=Math.max(0,Math.min(w-1.00001,x-x0)),zz=Math.max(0,Math.min(h-1.00001,z-z0)),i=Math.floor(xx),j=Math.floor(zz),a=xx-i,b=zz-j,k=i*h+j,f=roundedField
 return f[k]!*(1-a)*(1-b)+f[k+h]!*a*(1-b)+f[k+1]!*(1-a)*b+f[k+h+1]!*a*b
}
function evaluatePlantingGround(x:number,z:number){
 // Blend the cropped lawn into its original outline instead of attaching a circular bump.
 if(x>20&&x<29&&z>53&&z<65)return roundedCoverage(x,z)>=.5
 const revision=plantingRevision(x,z);if(revision!==undefined)return revision
 if(onLakeFenceBelt(x,z))return true
 if(revisedPublicApron(x,z)||dockTowerCourt(x,z))return false
 if(!insidePark(x,z,4.2)&&insidePark(x,z,1.8)&&onRoad(x,z,.05))return false
 if(!entranceForecourt(x,z)&&!insidePark(x,z,4.2))return true
 if(besideWood(x,z))return true
 if(onSquareEndedPath(x,z,STATION_APPROACH.a,STATION_APPROACH.b,STATION_APPROACH.width))return false
 const stage=site('balloon'),sx=Math.abs(x-stage.x),sz=z-stage.z;if(sx<STATION_STEPS.halfX+.8&&sz>STATION_STEPS.z0-.5&&sz<STATION_STEPS.z1+.8&&!onRoad(x,z,.05))return true
 if(onTowerAccess(x,z)||onEntrancePath(x,z))return false
 // A planted shoulder separates neighbouring ramp legs; paving never suggests a shortcut over the drop.
 if(x< -58&&z<0&&!onRoad(x,z,1.2))return true
 if(!inSummit(x,z)&&onSummitEdge(x,z,1.1)&&!onRoad(x,z,.1))return true
 if(!inLake(x,z)&&inLake(x,z,1.1)&&!onRoad(x,z,.15))return true
 if(SITES.some(s=>!s.kind&&s.radius&&!['plaza','pavilion','fitness','fountain','pagoda','jump','dock','island-pavilion','fishing'].includes(s.id)&&footprintDistance(s,x,z)<.05))return true
 if(inEllipse(x,z,REMOVED_POCKET))return false
 const main=site('pavilion'),gym=site('fitness'),gx=x-gym.x,gz=z-gym.z
 if(footprintDistance(main,x,z)<.05)return true
 if((gx/17.1)**2+(gz/13.1)**2<1&&(gx/15.2)**2+(gz/11.2)**2>1&&Math.abs(gx)>2.55&&Math.abs(gz)>2.55)return true
 if(Math.hypot(x-main.x,z-main.z)<17.8||Math.hypot(x-site('plaza').x,z-site('plaza').z)<21.4||entranceForecourt(x,z))return false
 if(onRoad(x,z,.05))return false
 if(x>8&&x<26&&z>-14&&z<0)return inEllipse(x,z,CAFE_CURVE)
 if([HUB_TREE_ISLAND,SOUTH_CLUSTER_GROVE,FOLK_FRONT_GROVE].some(e=>inEllipse(x,z,e)))return true
 return roundedCoverage(x,z)>=.5
}
const plantingGridCache=new Map<number,boolean>(),landGridCache=new Map<number,boolean>()
const gridKey=(x:number,z:number)=>Math.abs(x)<=130&&Math.abs(z)<=130&&Number.isInteger(x*2)&&Number.isInteger(z*2)?(x*2+260)*1024+z*2+260:null
export function isPlantingGround(x:number,z:number){const key=gridKey(x,z);if(key===null)return evaluatePlantingGround(x,z);const old=plantingGridCache.get(key);if(old!==undefined)return old;const value=evaluatePlantingGround(x,z);plantingGridCache.set(key,value);return value}
const underWood=(x:number,z:number)=>onFishingDeck(x,z)||x>=BRIDGE_LANDINGS[0].x0&&x<=BRIDGE_LANDINGS[1].x1&&Math.abs(z-BRIDGE.z)<BRIDGE.width/2||[DOCK_ACCESS,FISHING_ACCESS].some(a=>a.points.slice(1).some((b,i)=>onSquareEndedPath(x,z,a.points[i]!,b,a.width)))
const evaluateLand=(x:number,z:number)=>!((x-LAKE.island.x)**2/LAKE.island.rx**2+(z-LAKE.island.z)**2/LAKE.island.rz**2<1)&&!(Math.abs(x-MONUMENT_STAIRS.x)<MONUMENT_STAIRS.width/2+.01&&z>MONUMENT_STAIRS.zTop+.001&&z<MONUMENT_STAIRS.zBottom)&&!underStation(x,z)&&!underWood(x,z)&&(((x-site('fitness').x)/15)**2+((z-site('fitness').z)/11)**2>1)&&insidePark(x,z)&&!inLake(x,z)&&Math.hypot(x-SITES.find(s=>s.id==='fountain')!.x,z-SITES.find(s=>s.id==='fountain')!.z)>17.608
export function onLand(x:number,z:number){const key=gridKey(x,z);if(key===null)return evaluateLand(x,z);const old=landGridCache.get(key);if(old!==undefined)return old;const value=evaluateLand(x,z);landGridCache.set(key,value);return value}
type Predicate=(x:number,z:number)=>boolean
/** Clip a small terrain cell at the actual curved outline, rather than dropping its centroid. */
export function clipGroundPolygon(polygon:readonly Point[],inside:Predicate):Point[]{
 if(!polygon.length)return []
 const output:Point[]=[]
 for(let i=0;i<polygon.length;i++){
  const a=polygon[i]!,b=polygon[(i+1)%polygon.length]!,ia=inside(a[0],a[1]),ib=inside(b[0],b[1])
  if(ia)output.push(a)
  if(ia!==ib){let low=0,high=1;for(let n=0;n<24;n++){const t=(low+high)/2,hit=inside(a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t);if(hit===ia)low=t;else high=t}const t=(low+high)/2;output.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t])}
 }
 return output
}
export function groundPieces(triangle:readonly Point[]){
 const land=clipGroundPolygon(triangle,onLand)
 if(land.length<3)return {grass:[],paving:[]} as {grass:Point[];paving:Point[]}
 return {grass:clipGroundPolygon(land,isPlantingGround),paving:clipGroundPolygon(land,(x,z)=>!isPlantingGround(x,z))}
}
export function polygonArea(points:readonly Point[]){return Math.abs(points.reduce((sum,a,i)=>{const b=points[(i+1)%points.length]!;return sum+a[0]*b[1]-b[0]*a[1]},0))/2}

export function getPlantingField(){roundedCoverage(0,0);return roundedField!}
