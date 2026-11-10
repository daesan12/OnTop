import type {JumpPad} from './jump10Plan.ts'

export interface PadContact {stood:number;hitAt:number;fallAt:number}
export interface JumpMotion {time:number;active:boolean;contacts:Map<string,PadContact>}
export const GIMMICKS={leafWait:3,leafReset:4,moleDuration:.95,moleDip:.48,pigeonAmplitude:.42,pigeonPeriod:3.8} as const
export function padContact(m:JumpMotion,p:JumpPad){let c=m.contacts.get(p.id);if(!c){c={stood:0,hitAt:-Infinity,fallAt:-Infinity};m.contacts.set(p.id,c)}return c}
/** Used by both rendering and swept collision; no independent animation clock. */
export function jumpPadPose(p:JumpPad,m:JumpMotion,time=m.time){
 let offset=0,solid=true,visible=true
 const c=m.contacts.get(p.id)
 if(m.active&&p.theme==='lily'&&c&&Number.isFinite(c.fallAt)){
  const age=time-c.fallAt
  if(age>=0&&age<GIMMICKS.leafReset){offset=-9*age*age;solid=false;visible=age<1.8}
 }
 if(m.active&&p.theme==='mole'&&c){const t=(time-c.hitAt)/GIMMICKS.moleDuration;if(t>=0&&t<=1)offset=-GIMMICKS.moleDip*Math.pow(Math.sin(Math.PI*t),2)}
 if(m.active&&p.theme==='pigeon'){
  const phase=Number(p.id.split('-').at(-1))*.53
  offset=GIMMICKS.pigeonAmplitude*Math.sin(time*Math.PI*2/GIMMICKS.pigeonPeriod+phase)
 }
 return{height:p.height+offset,offset,solid,visible}
}
export function advancePadContact(m:JumpMotion,p:JumpPad|null,dt:number){
 for(const [id,c]of m.contacts){
  if(Number.isFinite(c.fallAt)&&m.time-c.fallAt>=GIMMICKS.leafReset){c.fallAt=-Infinity;c.stood=0}
  if(id!==p?.id)c.stood=0
 }
 if(!m.active||!p||p.theme!=='lily')return
 const c=padContact(m,p)
 if(!Number.isFinite(c.fallAt)){c.stood+=dt;if(c.stood+1e-8>=GIMMICKS.leafWait)c.fallAt=m.time}
}
