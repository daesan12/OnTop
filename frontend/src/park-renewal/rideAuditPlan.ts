import {HILL_NODE_IDS} from './hillRoute.ts'
import {NODES,ENTRANCE_PATHS,CAFE_ENTRY_ROUTE,type Point} from './plan.ts'
import {canTravel,TRAVEL_PROFILES,type Travel} from './travelMotion.ts'
const cafe=ENTRANCE_PATHS.find(p=>p.id==='cafe')!
// Stop with room for the whole vehicle in front of the counter, rather than driving into it.
export const CAFE_RIDE_STOP:Point=[cafe.b[0],cafe.b[1]+2.7]
export const RIDE_ROUTES=[{id:'mole',name:'두더지 옆길',nodes:['arcadeEast','moleWest','pigeon']},{id:'fishing',name:'낚시터 앞길',nodes:['east-mid','fishing','east-north']},{id:'balloon',name:'열기구 오름길',nodes:['west-fork','hill0','hill1','hillBend','hill2','hill-loop','hill-cross','summitBend','balloon']},{id:'fountain',name:'분수 연결길',nodes:['southEastPlaza','fountainGate','fountainCourt']},{id:'tower',name:'전망대 앞길',nodes:['east-south','tower','towerNW','towerNorth','east-mid']},{id:'cafe',name:'카페 진입로',points:[...CAFE_ENTRY_ROUTE.slice(0,-1),CAFE_RIDE_STOP]}] as const
export const GRADE_RIDE_ROUTES=[
 {id:'cafe-northeast',name:'카페→북동 팔각정',nodes:['cafe','bankSouth','bridge-bank','bankNorth','lakeCurve3','lakeCurve2','lakeCurve1','lakeCurve0','lake-west-north','lakeWestBend','lake-nw','lake-north','rest-ne']},
 {id:'jump-balloon',name:'점프맵 뒤→열기구 정상',nodes:['jumpWest','forestBypass','westLower','west-fork','hill0','hill1','hillBend','hill2','hill-loop','hill-cross','summitBend','balloon']},
]as const
export const EDGE_RIDE_ROUTES=[
 {id:'hill-turn-edge',name:'열기구 아래 회전 구간',nodes:['hill2','hill-loop']},
 {id:'hill-upper-edge',name:'열기구 상부 오르막',nodes:['hill-loop','hill-cross']},
 {id:'hill-landing-edge',name:'열기구 정상 연결부',nodes:['hill-cross','summitBend']},
]as const
/** Connected entry-to-entry circuits; cul-de-sac approaches include a stop and return. */
export const PARK_RIDE_ROUTES=[
 {id:'park-west',name:'정문·운동마당·서쪽 놀이숲 순환',nodes:['entry','entryFolk','folkSide','rest-sw','west-south','arcadeSouthEast','arcade','arcadeFrontWest','westArcade','jumpWest','jump','jumpApproach','arcadeEast','moleWest','pigeon','westPavilion','square','southPlaza','arrival','entry']},
 {id:'park-hill',name:'정문·열기구·대석탑 정원 순환',nodes:['entry','arrival','southPlaza','square','westPavilion','westPavilionNorth','bread','shooting','vr','west-fork','hill0','hill1','hillBend','hill2','hill-loop','hill-cross','summitBend','balloon','summitBend','summitFrontBend','monumentW','monumentWestSide','monumentNW','monumentN','monumentNE','monumentEastSide','monumentE','monument','summitRentals','monumentW','summitFrontBend','summitBend','hill-cross','hill-loop','hill2','hillBend','hill1','hill0','west-fork','vr','shooting','bread','westPavilionNorth','northCenter','eastPavilionNorth','eastPavilion','gachaFront','eastCluster','fountainGate','southEastPlaza','southPlaza','arrival','entry']},
 {id:'park-lake',name:'정문·분수·전망대·호수·카페 순환',nodes:['entry','entryEast','fountainSW','fountainSouth','entranceEast','entranceEastNorth','pavilionBypass','east-south','restSEBend','rest-se','restSEBend','east-south','tower','towerNW','towerNorth','east-mid','fishing','east-north','lake-north','lake-nw','lakeWestBend','lake-west-north','lakeCurve0','lakeCurve1','lakeCurve2','lakeCurve3','bankNorth','bridge-bank','bankSouth','cafe','eastPavilionNorth','northCenter','westPavilionNorth','westPavilion','square','southPlaza','arrival','entry']},
]as const
export const ALL_RIDE_ROUTES=[...RIDE_ROUTES,...GRADE_RIDE_ROUTES,...EDGE_RIDE_ROUTES,...PARK_RIDE_ROUTES]
export type RideRoute=typeof ALL_RIDE_ROUTES[number]['id']
/** Circular fillets retain a positive inside-lane turning radius at the hairpin.
 * Tiny redundant waypoints must not create a sub-vehicle-radius loop in an offset lane.
 */
export function ridePath(id:RideRoute,reverse=false,lane=0):Point[]{
 const route=ALL_RIDE_ROUTES.find(r=>r.id===id)!,source='points'in route?route.points:route.nodes.flatMap((id,i)=>{const a=i?HILL_NODE_IDS.indexOf(route.nodes[i-1]as typeof HILL_NODE_IDS[number]):-1,b=HILL_NODE_IDS.indexOf(id as typeof HILL_NODE_IDS[number]);if(i&&((route.nodes[i-1]==='fishing'&&id==='east-north')||(route.nodes[i-1]==='east-north'&&id==='fishing')))return[NODES.fishingBypass!,NODES[id]!];if(a<0||b<0||Math.abs(a-b)<=1)return[NODES[id]!];const names=a<b?HILL_NODE_IDS.slice(a+1,b+1):HILL_NODE_IDS.slice(b,a).reverse();return names.map(n=>NODES[n]!)}),raw=source.filter((p,i)=>i===0||i===source.length-1||Math.hypot(p[0]-source[i-1]![0],p[1]-source[i-1]![1])>=1),path:Point[]=[raw[0]!]
 for(let i=1;i<raw.length-1;i++){
  const a=raw[i-1]!,b=raw[i]!,c=raw[i+1]!,ab=Math.hypot(b[0]-a[0],b[1]-a[1]),bc=Math.hypot(c[0]-b[0],c[1]-b[1]),ux=(b[0]-a[0])/ab,uz=(b[1]-a[1])/ab,vx=(c[0]-b[0])/bc,vz=(c[1]-b[1])/bc,angle=Math.acos(Math.max(-1,Math.min(1,ux*vx+uz*vz))),sign=Math.sign(ux*vz-uz*vx)
  if(angle<.001||!sign){path.push(b);continue}
  const trim=Math.min(2.5*Math.tan(angle/2),ab*.4,bc*.4),radius=trim/Math.tan(angle/2),entry:Point=[b[0]-ux*trim,b[1]-uz*trim],cx=entry[0]-uz*radius*sign,cz=entry[1]+ux*radius*sign,start=Math.atan2(entry[1]-cz,entry[0]-cx),steps=Math.max(4,Math.ceil(angle*radius/.15))
  path.push(entry)
  for(let k=1;k<=steps;k++){const theta=start+sign*angle*k/steps;path.push([cx+radius*Math.cos(theta),cz+radius*Math.sin(theta)])}
 }
 path.push(raw.at(-1)!);const shifted=path.map((p,i):Point=>{const a=path[Math.max(0,i-1)]!,b=path[Math.min(path.length-1,i+1)]!,d=Math.hypot(b[0]-a[0],b[1]-a[1]);return d<1e-7?p:[p[0]-(b[1]-a[1])/d*lane,p[1]+(b[0]-a[0])/d*lane]});return reverse?shifted.reverse():shifted
}
export function createRide(id:RideRoute,travel:Exclude<Travel,'walk'>,surface:(x:number,z:number)=>number,reverse=false,lane=0){const path=ridePath(id,reverse,lane),p=path[0]!;return{id,travel,lane,reverse,path,next:1,x:p[0],z:p[1],y:surface(...p),yaw:Math.atan2(path[1]![0]-p[0],path[1]![1]-p[1]),distance:0,steps:0,blocked:false,complete:false,maxGrade:0,steepest:[p[0],p[1]]as Point,maxRoll:0,rollPoint:[p[0],p[1]]as Point,roadMisses:0}}
export type RideState=ReturnType<typeof createRide>
export function stepRide(s:RideState,dt:number,surface:(x:number,z:number)=>number){
 let remaining=TRAVEL_PROFILES[s.travel].speed*Math.min(.05,Math.max(0,dt));const profile=TRAVEL_PROFILES[s.travel]
 while(remaining>1e-7&&!s.complete&&!s.blocked){const q=s.path[s.next]!,dx=q[0]-s.x,dz=q[1]-s.z,d=Math.hypot(dx,dz);if(d<1e-6){s.next++;if(s.next>=s.path.length)s.complete=true;continue}const length=Math.min(d,remaining,.15),x=s.x+dx/d*length,z=s.z+dz/d*length,yaw=Math.atan2(dx,dz);if(!canTravel([s.x,s.z],[x,z],s.y,s.travel,yaw)){s.blocked=true;break}const y=surface(x,z),grade=Math.abs(y-s.y)/length;if(grade>s.maxGrade){s.maxGrade=grade;s.steepest=[x,z]}const w=profile.halfWidth,c=Math.cos(yaw),sn=Math.sin(yaw);const roll=Math.abs(surface(x+c*w,z-sn*w)-surface(x-c*w,z+sn*w))/(2*w);if(roll>s.maxRoll){s.maxRoll=roll;s.rollPoint=[x,z]}Object.assign(s,{x,z,y,yaw});s.distance+=length;s.steps++;remaining-=length}
 return s
}
