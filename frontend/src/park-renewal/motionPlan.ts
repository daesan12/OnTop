import {jumpFenceSections} from './jumpFencePlan.ts'
import {HORROR,horrorState,horrorMotion,inHorror,horrorApron} from './horrorPlan.ts'
import {site,insidePark,heightAt,inLake,onBridge,deckHeightAt,distanceToSegment,fishingRailSections,fishingStairHeight,type Point} from './plan.ts'
import {guardRuns} from './guardLayout.ts'
import {lakeFenceSegments} from './lakePlan.ts'
export const FITNESS_FENCE={rx:16.2,rz:12.2,opening:5.6,height:1.4} as const
export function fitnessFenceSegments(){
 const s=site('fitness'),list:{a:Point;z:Point}[]=[],count=90
 const open=([x,z]:Point)=>Math.abs(x-s.x)<FITNESS_FENCE.opening/2||Math.abs(z-s.z)<FITNESS_FENCE.opening/2
 for(let i=0;i<count;i++){const point=(j:number):Point=>[s.x+Math.cos(j/count*Math.PI*2)*FITNESS_FENCE.rx,s.z+Math.sin(j/count*Math.PI*2)*FITNESS_FENCE.rz],a=point(i),z=point(i+1),ia=open(a),ib=open(z)
  if(ia&&ib)continue;if(!ia&&!ib){list.push({a,z});continue}
  let lo=0,hi=1;for(let j=0;j<24;j++){const t=(lo+hi)/2,p:Point=[a[0]+(z[0]-a[0])*t,a[1]+(z[1]-a[1])*t];if(open(p)===ia)lo=t;else hi=t}const t=(lo+hi)/2,p:Point=[a[0]+(z[0]-a[0])*t,a[1]+(z[1]-a[1])*t];list.push(ia?{a:p,z}:{a,z:p})
 }return list
}
export const jumpFenceSegments=()=>jumpFenceSections
const gym=fitnessFenceSegments(),lake=lakeFenceSegments(),jump=jumpFenceSegments()
const fishingRails=fishingRailSections()
// Static collision heights and local buckets avoid re-evaluating the entire terrain per fence on every vehicle sample.
const guards=guardRuns.flatMap(path=>path.slice(1).map((b,i)=>({a:[path[i]![0],path[i]![2]]as Point,b:[b[0],b[2]]as Point,top:Math.min(path[i]![1],b[1])+1.3,hill:true}))).concat([gym,lake,jump].flatMap(f=>f.map(g=>({a:g.a,b:g.z,top:heightAt(...g.a)+1.45,hill:false}))))
const bins=new Map<string,typeof guards>()
for(const g of guards)for(let x=Math.floor((Math.min(g.a[0],g.b[0])-.45)/8);x<=Math.floor((Math.max(g.a[0],g.b[0])+.45)/8);x++)for(let z=Math.floor((Math.min(g.a[1],g.b[1])-.45)/8);z<=Math.floor((Math.max(g.a[1],g.b[1])+.45)/8);z++){const k=x+','+z,list=bins.get(k)??[];list.push(g);bins.set(k,list)}
/** The movement boundary applies at every altitude; observer cameras are separate. */
export function insideMovementBoundary(x:number,z:number,_y:number){return insidePark(x,z,.65)}
export function clearMotionSegment(from:Point,to:Point,y:number,{water=false,air=false}={}){
 if(!air&&!horrorMotion(from,to,y))return false
 const length=Math.hypot(to[0]-from[0],to[1]-from[1]),n=Math.max(1,Math.ceil(length/.2))
 for(let i=1;i<=n;i++){const x=from[0]+(to[0]-from[0])*i/n,z=from[1]+(to[1]-from[1])*i/n;if(!insideMovementBoundary(x,z,y))return false
  if(!air){if(!water&&inLake(x,z,1.2)&&!onBridge(x,z)&&deckHeightAt(x,z)===null)return false
   if(x>75&&x<90&&z> -51&&z< -34){const stair=fishingStairHeight(x,z);if(stair!==null&&stair-y>.35)return false;for(const r of fishingRails)if(y>Math.min(r.floor,r.endFloor)-.3&&y<Math.max(r.floor,r.endFloor)+1.5&&distanceToSegment(x,z,r.a,r.b)<.22)return false}
   for(const g of bins.get(Math.floor(x/8)+','+Math.floor(z/8))??[])if(!(g.hill&&horrorState.open&&y<HORROR.floor+HORROR.height&&(inHorror(x,z)||horrorApron(x,z)))&&y<g.top&&distanceToSegment(x,z,g.a,g.b)<(g.hill?.4:.34))return false
  }
 }
 return true
}
