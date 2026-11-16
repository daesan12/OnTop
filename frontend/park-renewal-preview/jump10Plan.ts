import {DEV_JUMP_SIX} from './devJumpSixSnapshot.ts'
import {site,heightAt,inLake} from './plan.ts'
export type JumpTheme='stone'|'gomoku'|'fish'|'cloud'|'lantern'|'kite'|'lily'|'pigeon'|'mole'|'duck'|'gate'
export interface JumpPad {id:string;stage:number;theme:JumpTheme;x:number;z:number;height:number;yaw:number;halfX:number;halfZ:number;radius?:number;thickness?:number;gate?:number;stoneTone?:'black'|'white';collisionYaw?:number;sourceId?:string}
export const JUMP_STAGES=[
 {name:'석탑',theme:'stone',count:24},{name:'오목돌',theme:'gomoku',count:9},{name:'붕어빵',theme:'fish',count:13},{name:'구름',theme:'cloud',count:12},
 {name:'청사초롱',theme:'lantern',count:17},{name:'방패연',theme:'kite',count:18},{name:'연잎',theme:'lily',count:14},
 {name:'두더지',theme:'mole',count:16},{name:'비둘기',theme:'pigeon',count:18},{name:'오리',theme:'duck',count:28},
] as const
const jump=site('jump'),ground=heightAt(jump.x,jump.z)
export const JUMP_START={x:jump.x,z:jump.z+8.9,y:heightAt(jump.x,jump.z+8.9)}
export const JUMP_FINISH={x:62,z:-5,y:4.285,radius:2}
const pads:JumpPad[]=[],gates:JumpPad[]=[]
// Only translate the six accepted service stages. Do not rescale or rebalance them.
export const DEV_JUMP_TRANSLATION={x:jump.x-DEV_JUMP_SIX.start.x,z:jump.z-(DEV_JUMP_SIX.start.z-8.9),y:ground}
const native=(p:typeof DEV_JUMP_SIX.pads[number]|typeof DEV_JUMP_SIX.gates[number]):JumpPad=>({...p,x:p.x+DEV_JUMP_TRANSLATION.x,z:p.z+DEV_JUMP_TRANSLATION.z,height:p.height+ground,sourceId:p.id,collisionYaw:0,stoneTone:p.theme==='gomoku'?(p.ordinal%2?'black':'white'):undefined})
pads.push(...DEV_JUMP_SIX.pads.map(native));gates.push(...DEV_JUMP_SIX.gates.map(native))
const dimensions=(theme:JumpTheme)=>theme==='duck'?{halfX:.85,halfZ:1.02}:({halfX:theme==='lily'?1.15:.8,halfZ:theme==='lily'?1.15:.8,radius:theme==='lily'?1.15:theme==='mole'?.78:.8})
const anchors=[[-22,42,48],[5,70,48],[55,35,48],[62,-7.2,5.1]] as const
for(let stage=6;stage<10;stage++){
 const start=gates.at(-1)!,end=anchors[stage-6]!,spec=JUMP_STAGES[stage]!,dx=end[0]-start.x,dz=end[1]-start.z,len=Math.hypot(dx,dz),yaw=Math.atan2(dx,dz)
 const curve=Array.from({length:201},(_,i)=>{const t=i/200;return{x:(1-t)**2*start.x+2*(1-t)*t*(stage===7?-47:104)+t*t*end[0],z:(1-t)**2*start.z+2*(1-t)*t*(stage===7?72:-2)+t*t*end[1],d:0}})
 for(let i=1;i<curve.length;i++)curve[i]!.d=curve[i-1]!.d+Math.hypot(curve[i]!.x-curve[i-1]!.x,curve[i]!.z-curve[i-1]!.z)
 const duckPoint=(t:number)=>{const distance=curve.at(-1)!.d*t,j=Math.max(1,curve.findIndex(p=>p.d>=distance)),a=curve[j-1]!,b=curve[j]!,u=(distance-a.d)/(b.d-a.d);const vx=b.x-a.x,vz=b.z-a.z,length=Math.hypot(vx,vz);return{x:a.x+vx*u,z:a.z+vz*u,nx:-vz/length,nz:vx/length,yaw:Math.atan2(vx,vz)}}

 for(let i=0;i<spec.count;i++){const t=(i+1)/(stage===9?spec.count:spec.count+1),duck=duckPoint(t),zig=stage===9&&i===spec.count-1?0:(i%2?1:-1)*(stage===6?.35:stage===7?.7:stage===8?.8:.75);pads.push({id:`detail-jump-${stage+1}-${i}`,stage,theme:spec.theme,x:(stage===9||stage===7?duck.x:start.x+dx*t)+(stage===9||stage===7?duck.nx:-dz/len)*zig,z:(stage===9||stage===7?duck.z:start.z+dz*t)+(stage===9||stage===7?duck.nz:dx/len)*zig,height:start.height+(end[2]-start.height)*t,yaw:spec.theme==='duck'?duck.yaw:spec.theme==='pigeon'?yaw:0,...dimensions(spec.theme)})}
 if(stage<9)gates.push({id:`detail-jump-gate-${stage+1}`,stage,theme:'gate',x:end[0],z:end[1],height:end[2],yaw,gate:stage+1,halfX:1.3,halfZ:1.3,radius:1.3})
}
/** Stage rewards exported to the server with the course. */
export const JUMP_REWARDS=[10,20,30,40,50,60,64,70,76,80] as const
export const JUMP_LAP_REWARD=JUMP_REWARDS.reduce((sum,n)=>sum+n,0)
export const JUMP_PADS:readonly JumpPad[]=pads
export const JUMP_GATES:readonly JumpPad[]=gates
export const JUMP_SEQUENCE=JUMP_STAGES.flatMap((_,i)=>[...pads.filter(p=>p.stage===i),...gates.filter(p=>p.stage===i)])
export { containsPad } from './jumpPadFootprint'
export const isJumpPadVisible=(p:JumpPad,started:boolean)=>started||p.id===pads[0]!.id
export const inFinish=(x:number,z:number)=>!inLake(x,z)&&Math.hypot(x-JUMP_FINISH.x,z-JUMP_FINISH.z)<JUMP_FINISH.radius+.6
