import {JUMP_FENCE_HEIGHT,jumpFenceRuns,jumpFenceSections} from './jumpFencePlan.ts'
import {HORROR,horrorState,horrorMotion,inHorror,horrorApron} from './horrorPlan.ts'
import {site,insidePark,heightAt,inLake,onBridge,deckHeightAt,distanceToSegment,fishingRailSections,fishingStairHeight,MONUMENT_STAIRS,monumentTreadHeight,type Point} from './plan.ts'
import {MOVEMENT} from '../src/config'
import {HILL_VERGE_INSET,HILLSIDE_RAIL_HEIGHTS,MONUMENT_STAIR_RAIL} from './guardDimensions'
import {ascentFenceRuns,hillsideGuardRuns} from './guardLayout.ts'
import {lakeFenceSegments} from './lakePlan.ts'
import {hitsParkProp} from './propCollision'
export const FITNESS_FENCE={rx:16.2,rz:12.2,opening:5.6,height:JUMP_FENCE_HEIGHT} as const
export function fitnessFenceSegments(){
 const s=site('fitness'),list:{a:Point;z:Point}[]=[],count=90
 const open=([x,z]:Point)=>Math.abs(x-s.x)<FITNESS_FENCE.opening/2||Math.abs(z-s.z)<FITNESS_FENCE.opening/2
 for(let i=0;i<count;i++){const point=(j:number):Point=>[s.x+Math.cos(j/count*Math.PI*2)*FITNESS_FENCE.rx,s.z+Math.sin(j/count*Math.PI*2)*FITNESS_FENCE.rz],a=point(i),z=point(i+1),ia=open(a),ib=open(z)
  if(ia&&ib)continue;if(!ia&&!ib){list.push({a,z});continue}
  let lo=0,hi=1;for(let j=0;j<24;j++){const t=(lo+hi)/2,p:Point=[a[0]+(z[0]-a[0])*t,a[1]+(z[1]-a[1])*t];if(open(p)===ia)lo=t;else hi=t}const t=(lo+hi)/2,p:Point=[a[0]+(z[0]-a[0])*t,a[1]+(z[1]-a[1])*t];list.push(ia?{a:p,z}:{a,z:p})
 }return list
}
export const jumpFenceSegments=()=>jumpFenceSections
const gym=fitnessFenceSegments(),lake=lakeFenceSegments()
const fishingRails=fishingRailSections()
// Static collision heights and local buckets avoid re-evaluating the entire terrain per fence on every vehicle sample.
type Guard={a:Point;b:Point;top:number;endTop?:number;hill:boolean;standable?:boolean}
function jumpGuards(runs:typeof ascentFenceRuns,hill:boolean):Guard[]{
 return runs.flatMap(path=>path.slice(1).map((b,i)=>{
  const a=path[i]!
  return {a:[a[0],a[2]]as Point,b:[b[0],b[2]]as Point,top:a[1]+JUMP_FENCE_HEIGHT,endTop:b[1]+JUMP_FENCE_HEIGHT,hill,standable:true}
 }))
}
const guards:Guard[]=[
 ...hillsideGuardRuns.flatMap(path=>path.slice(1).map((b,i)=>({a:[path[i]![0],path[i]![2]]as Point,b:[b[0],b[2]]as Point,top:Math.min(path[i]![1],b[1])+1.3,hill:true}))),
 ...lake.map(({a,z})=>({a,b:z,top:heightAt(...a)+1.45,hill:false})),
 ...gym.map(({a,z})=>({a,b:z,top:heightAt(...a)+FITNESS_FENCE.height,hill:false,standable:true})),
 ...jumpGuards(jumpFenceRuns,false),
 ...jumpGuards(ascentFenceRuns,true),
]
const bins=new Map<string,typeof guards>()
for(const g of guards)for(let x=Math.floor((Math.min(g.a[0],g.b[0])-.45)/8);x<=Math.floor((Math.max(g.a[0],g.b[0])+.45)/8);x++)for(let z=Math.floor((Math.min(g.a[1],g.b[1])-.45)/8);z<=Math.floor((Math.max(g.a[1],g.b[1])+.45)/8);z++){const k=x+','+z,list=bins.get(k)??[];list.push(g);bins.set(k,list)}
const guardsAt=(x:number,z:number)=>bins.get(Math.floor(x/8)+','+Math.floor(z/8))??[]
function guardTopAt(g:Guard,x:number,z:number){
 if(g.endTop===undefined)return g.top
 const dx=g.b[0]-g.a[0],dz=g.b[1]-g.a[1]
 const fraction=Math.max(0,Math.min(1,((x-g.a[0])*dx+(z-g.a[1])*dz)/(dx*dx+dz*dz||1)))
 return g.top+(g.endTop-g.top)*fraction
}
export function standableFenceTopAt(x:number,z:number,previousFootY:number){
 let support=-Infinity
 for(const guard of guardsAt(x,z)){
  if(!guard.standable||distanceToSegment(x,z,guard.a,guard.b)>.07)continue
  const top=guardTopAt(guard,x,z)
  if(top<=previousFootY+.005)support=Math.max(top,support)
 }
 return support
}
/** The movement boundary applies at every altitude; observer cameras are separate. */
export function insideMovementBoundary(x:number,z:number,_y:number){return insidePark(x,z,.65)}
function hitsMonumentRail(x:number,z:number,foot:number){
 const s=MONUMENT_STAIRS,rail=MONUMENT_STAIR_RAIL,radius=MOVEMENT.radius
 const sideDistance=Math.abs(Math.abs(x-s.x)-(s.width/2+rail.sideOffset))-rail.postWidth/2
 const endDistance=Math.max(s.zTop-HILL_VERGE_INSET-rail.postWidth/2-z,z-s.zBottom-rail.bottomOverhang-rail.postWidth/2,0)
 if(Math.hypot(Math.max(0,sideDistance),endDistance)>=radius)return false
 const tread=z>s.zBottom?s.bottom+.085:monumentTreadHeight(z)
 const t=Math.max(0,Math.min(1,(z-s.zTop)/(s.zBottom-s.zTop)))
 const handrail=z<s.zTop?s.top+.12+HILLSIDE_RAIL_HEIGHTS[1]:s.top-(s.top-s.bottom)*t+rail.height
 return foot<handrail+rail.handrailWidth/2&&foot+2*(MOVEMENT.halfHeight+radius)>tread-.02
}
export function clearMotionSegment(from:Point,to:Point,y:number,{water=false,air=false}={}){
 if(!air&&!horrorMotion(from,to,y))return false
 const length=Math.hypot(to[0]-from[0],to[1]-from[1]),n=Math.max(1,Math.ceil(length/.2))
 for(let i=1;i<=n;i++){const x=from[0]+(to[0]-from[0])*i/n,z=from[1]+(to[1]-from[1])*i/n;if(!insideMovementBoundary(x,z,y)||hitsMonumentRail(x,z,y)||hitsParkProp(x,z,y))return false
  if(!air){if(!water&&inLake(x,z,1.2)&&!onBridge(x,z)&&deckHeightAt(x,z)===null)return false
   if(x>75&&x<90&&z> -51&&z< -34){const stair=fishingStairHeight(x,z);if(stair!==null&&stair-y>.35)return false;for(const r of fishingRails)if(y>Math.min(r.floor,r.endFloor)-.3&&y<Math.max(r.floor,r.endFloor)+1.5&&distanceToSegment(x,z,r.a,r.b)<.22)return false}
   for(const g of guardsAt(x,z))if(!(g.hill&&horrorState.open&&y<HORROR.floor+HORROR.height&&(inHorror(x,z)||horrorApron(x,z)))&&y<guardTopAt(g,x,z)&&distanceToSegment(x,z,g.a,g.b)<(g.hill?.4:.34))return false
  }
 }
 return true
}
