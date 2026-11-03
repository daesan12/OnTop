import { DRAFT_JUMP_PADS,SITES } from './layout'

export const JUMP_STAGES=[
  {name:'석탑',theme:'stone',count:24,reward:5,asmr:'왁스 크랙'},
  {name:'오목돌',theme:'gomoku',count:9,reward:10,asmr:'키캡'},
  {name:'붕어빵',theme:'fish',count:13,reward:20,asmr:'크런치'},
  {name:'구름',theme:'cloud',count:12,reward:30,asmr:'스퀴시'},
  {name:'청사초롱',theme:'lantern',count:17,reward:40,asmr:'팝잇'},
  {name:'방패연',theme:'kite',count:18,reward:60,asmr:'한지 크리스피'},
  {name:'연잎',theme:'lily',count:14,reward:85,asmr:'물 · 슬라임'},
] as const
export type JumpTheme=(typeof JUMP_STAGES)[number]['theme']|'gate'
export type JumpPad={id:string;stage:number;theme:JumpTheme;x:number;z:number;height:number;halfX:number;halfZ:number;radius?:number;thickness:number;yaw:number;ordinal:number;gate?:number}
const x=SITES.vrPagoda.x,z=SITES.vrPagoda.z,dx=x+48,dz=z+8
const source=(a:number,b:number)=>({x:a+dx,z:b+dz})
const gate=(n:number,a:number,b:number,height:number):JumpPad=>({id:`layout-jump-gate-${n}`,stage:n-1,gate:n,theme:'gate',...source(a,b),height,halfX:1.3,halfZ:1.3,radius:1.3,thickness:.45,yaw:0,ordinal:-1})
export const JUMP_GATES=[gate(1,-48,-2.1,16.25),gate(2,-41.9,-4.5,25.05),gate(3,-24,6,34.99),gate(4,-13.6,8.7,45.39),
  {...gate(5,8,-44,45.79),x:SITES.pagoda.x+8,z:SITES.pagoda.z},
  {...gate(6,26,4,39.52),x:26,z:4}]
const pads:JumpPad[]=DRAFT_JUMP_PADS.map((p,i)=>({...p,stage:0,theme:'stone',halfX:p.width/2,halfZ:p.depth/2,yaw:0,ordinal:i}))
const add=(stage:number,i:number,px:number,pz:number,height:number,radius:number,thickness:number,yaw=0)=>pads.push({id:`layout-jump-${stage+1}-${i}`,stage,theme:JUMP_STAGES[stage]!.theme,x:px,z:pz,height,halfX:radius,halfZ:radius,radius,thickness,yaw,ordinal:i})
for(let i=0;i<9;i++){const a=(120+i*30)*Math.PI/180;add(1,i,x+Math.cos(a)*7,z+Math.sin(a)*7,17.1+i*7.1/8,.85,.5)}
const a2=JUMP_GATES[1]!,a3=JUMP_GATES[2]!
for(let i=0;i<13;i++) {
  const t=(i+1)/14,vx=a3.x-a2.x,vz=a3.z-a2.z,length=Math.hypot(vx,vz),zig=(i%2?1:-1)*.9
  add(2,i,a2.x+vx*t-vz/length*zig,a2.z+vz*t+vx/length*zig,25.8+i*8.5/12,.8,.6,Math.atan2(vx,vz)+(i%2?.22:-.22)-Math.PI/2)
}
const cloud=source(-19,10)
for(let i=0;i<12;i++){const a=(-109+i*38)*Math.PI/180;add(3,i,cloud.x+Math.cos(a)*5.5,cloud.z+Math.sin(a)*5.5,35.8+i*8.8/11,1.1,.9,i*1.17)}
const a4=JUMP_GATES[3]!,a5=JUMP_GATES[4]!
for(let i=0;i<17;i++){const t=(i+1)/18;add(4,i,a4.x+(a5.x-a4.x)*t,a4.z+(a5.z-a4.z)*t,45.6+Math.sin(i*.95)*.9,.72,1.4)}
const a6=JUMP_GATES[5]!
// Sample by arc length so the eastward kite turn never hides an unexpectedly large gap.
const curve=Array.from({length:201},(_,i)=>{const t=i/200,u=1-t;return {x:u*u*u*a5.x+3*u*u*t*50+3*u*t*t*53+t*t*t*a6.x,z:u*u*u*a5.z+3*u*u*t*(-42)+3*u*t*t*3+t*t*t*a6.z,d:0}})
for(let i=1;i<curve.length;i++)curve[i]!.d=curve[i-1]!.d+Math.hypot(curve[i]!.x-curve[i-1]!.x,curve[i]!.z-curve[i-1]!.z)
for(let i=0;i<18;i++) {
  const d=curve.at(-1)!.d*(i+1)/19,j=curve.findIndex(p=>p.d>=d),a=curve[Math.max(0,j-1)]!,b=curve[j]!,t=(d-a.d)/(b.d-a.d)
  add(5,i,a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t,45.5-i*5.6/17,.8,.05);const p=pads.at(-1)!;p.radius=undefined;p.halfZ=.95
}
const finish={x:SITES.lake.x-6,z:SITES.lake.z+2},vx=finish.x-a6.x,vz=finish.z-a6.z,length=Math.hypot(vx,vz)
for(let i=0;i<14;i++) {
  const t=(i+1)/14,zig=i===13?0:(i%2?1:-1)*1.1
  add(6,i,a6.x+vx*t-vz/length*zig,a6.z+vz*t+vx/length*zig,i===13?8:37.3-i*29.3/13,1,.1,i*.71)
}
export const JUMP_PADS:readonly JumpPad[]=pads
export const JUMP_SEQUENCE=JUMP_STAGES.flatMap((_,stage)=>[...pads.filter(p=>p.stage===stage),...(stage<6?[JUMP_GATES[stage]!]:[])])
JUMP_GATES.forEach(g=>{const i=JUMP_SEQUENCE.indexOf(g),before=JUMP_SEQUENCE[i-1]!,after=JUMP_SEQUENCE[i+1]!;g.yaw=Math.atan2(after.x-before.x,after.z-before.z)})
export const JUMP_START={x,z:z+8.9,y:0}
export const JUMP_FINISH={x:finish.x+vx/length*2.6,z:finish.z+vz/length*2.6,y:SITES.lake.surfaceY+.1}
export const jumpReview={stage:-1,revision:0}
export function focusJumpStage(stage:number){jumpReview.stage=stage;jumpReview.revision++}
export function containsJumpPad(p:JumpPad,px:number,pz:number,margin=.18) {
  return p.radius!==undefined?Math.hypot(px-p.x,pz-p.z)<=p.radius+margin:Math.abs(px-p.x)<=p.halfX+margin&&Math.abs(pz-p.z)<=p.halfZ+margin
}
