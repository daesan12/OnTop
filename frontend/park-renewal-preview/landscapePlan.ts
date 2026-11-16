import {onRoad,insidePark,inLake,SITES,footprintDistance,NODES,EDGES,BRIDGE_EDGES,site,type Point} from './plan.ts'
export const FOREST_TRAILS:{id:string;points:Point[];width:number}[]=[
 {id:'south-woodland',points:[[72,78],[66,82]],width:3.4},
 {id:'northeast-woodland',points:[[56,-88],[62,-85]],width:3.2},
]
const requestedSigns=[
 {x:-10,z:93,variant:'crossroads',destinations:[{label:'중앙광장',direction:'left'},{label:'호수 · 전망대',direction:'right'},{label:'운동마당',direction:'left'}]},
 {x:-49,z:23,variant:'crossroads',destinations:[{label:'오락실',direction:'left'},{label:'두더지 · 중앙광장',direction:'right'},{label:'VR · 점프맵',direction:'left'}]},
 {x:36,z:28,variant:'crossroads',destinations:[{label:'오리배 · 전망대',direction:'right'},{label:'카페',direction:'left'},{label:'중앙광장',direction:'left'}]},
 {x:24,z:-35,variant:'crossroads',destinations:[{label:'북쪽 쉼터 · 낚시',direction:'right'},{label:'대석탑 정원',direction:'left'},{label:'중앙광장',direction:'left'}]},
 {x:-77.5,z:45.5,variant:'wood-arrow',label:'돌탑 점프맵',target:[-83,28] as Point},
 {x:-83,z:-17,variant:'wood-arrow',label:'열기구 승강장',target:[-84,-28] as Point},
 {x:5,z:-12,variant:'wood-arrow',label:'대석탑 정원 · 계단',target:[0,-47] as Point},
 {x:-48,z:-1,variant:'wood-arrow',label:'대석탑 · 우회 오름길',target:[-75,-8] as Point},
] as const

/** Sign poles and arrow boards belong on the verge, ahead of each destination. */
const placedSigns=requestedSigns.map(s=>{
 for(let distance=0;distance<=8;distance+=.5)for(let i=0;i<24;i++){const a=i/24*Math.PI*2,x=s.x+Math.cos(a)*distance,z=s.z+Math.sin(a)*distance;if(insidePark(x,z,3)&&!inLake(x,z,3)&&!onRoad(x,z,2)&&!SITES.some(p=>!p.kind&&p.radius&&footprintDistance(p,x,z)<2))return{...s,x,z}}
 return {...s}
})

/** Follow the first public-road branch, including the walking staircase, rather than pointing across lawns. */
export function signRoute(x:number,z:number,target:string):Point[]{
 const edges=[...EDGES,...BRIDGE_EDGES,['northCenter','monumentLanding',4.5]as const],goal=site(target).node
 const nearest=edges.map(([a,b])=>{const p=NODES[a]!,q=NODES[b]!,dx=q[0]-p[0],dz=q[1]-p[1],length=Math.hypot(dx,dz),t=Math.max(0,Math.min(1,((x-p[0])*dx+(z-p[1])*dz)/(length*length))),point:Point=[p[0]+dx*t,p[1]+dz*t];return{a,b,length,t,point,d:Math.hypot(x-point[0],z-point[1])}}).sort((a,b)=>a.d-b.d)[0]!
 const distances=new Map([[nearest.a,nearest.length*nearest.t],[nearest.b,nearest.length*(1-nearest.t)]]),previous=new Map<string,string>(),pending=new Set(Object.keys(NODES))
 while(pending.size){let current:string|undefined,best=Infinity;for(const id of pending){const d=distances.get(id)??Infinity;if(d<best){best=d;current=id}}if(!current)break;pending.delete(current);if(current===goal)break;for(const[a,b]of edges){const next=a===current?b:b===current?a:undefined;if(!next||!pending.has(next))continue;const p=NODES[current]!,q=NODES[next]!,d=best+Math.hypot(q[0]-p[0],q[1]-p[1]);if(d<(distances.get(next)??Infinity)){distances.set(next,d);previous.set(next,current)}}}
 const ids=[goal];while(previous.has(ids[0]!))ids.unshift(previous.get(ids[0]!)!);return [nearest.point,...ids.map(id=>NODES[id]!)]
}
const destinations=[['plaza','tower','fitness'],['arcade','mole','vr'],['dock','cafe','plaza'],['fishing','pagoda','plaza'],['jump'],['balloon'],['pagoda'],['balloon']]
const labels=[['중앙광장','호수 · 전망대','운동마당'],['오락실','두더지 · 중앙광장','VR 꼬치왕'],['오리배 · 전망대','카페','중앙광장'],['북쪽 쉼터 · 낚시','대석탑 정원','중앙광장'],['돌탑 점프맵'],['열기구 승강장'],['대석탑 정원 · 계단'],['열기구 · 우회 오름길']]
export const SIGNPOSTS=placedSigns.map((s,i)=>({...s,boards:destinations[i]!.map((target,j)=>{
 const path=signRoute(s.x,s.z,target);let remaining=14,look=path.at(-1)!
 for(let k=1;k<path.length;k++){const a=path[k-1]!,b=path[k]!,d=Math.hypot(b[0]-a[0],b[1]-a[1]);if(d>=remaining){look=[a[0]+(b[0]-a[0])*remaining/d,a[1]+(b[1]-a[1])*remaining/d];break}remaining-=d}
 const direction:Point=[look[0]-s.x,look[1]-s.z],yaw=Math.atan2(-direction[1],direction[0]);return{label:labels[i]![j]!,target,path,look,direction,yaw}
 })}))
