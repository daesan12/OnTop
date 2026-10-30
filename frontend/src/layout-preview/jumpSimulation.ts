import { canWalk,walkHeight,DRAFT_PAVILIONS,SITES } from './layout'
import { insideRoundedSquare } from '../world/art/roundedOutline'
import { swimmingAt,DRAFT_LAKE } from './lakeLayout'
import { JUMP_PADS,JUMP_GATES,JUMP_STAGES,JUMP_START,containsJumpPad,type JumpPad } from './jumpCourse'

export const JUMP_RULES={walk:6.25,run:9,speed:6.2,gravity:18,terminal:20,coyote:.1,buffer:.15,step:.22} as const
export type JumpHit={id:number;pad:JumpPad;time:number;kind:'land'|'leave'}
export type JumpResult={kind:'fall'|'water'|'complete';stage:number;coins:number;time:number;best:boolean;at:number}
export function createJumpSession(){return {
  x:Number(JUMP_START.x),z:Number(JUMP_START.z),y:walkHeight(JUMP_START.x,JUMP_START.z),vy:0,time:0,grounded:true,
  yaw:0,pitch:.06,vx:0,vz:0,swimming:false,pad:null as JumpPad|null,leftAt:-1e6,jumped:false,bufferUntil:-1e6,
  active:false,nextGate:1,lastLeaf:false,startedAt:0,elapsed:0,maxHeight:0,coins:0,today:0,date:'',bestTime:Infinity,
  result:null as JumpResult|null,hits:[] as JumpHit[],hitSerial:0,seen:new Map<string,number>(),
  banner:'',bannerUntil:0,navigate:false,muted:false,manual:false,
}}
export type JumpSession=ReturnType<typeof createJumpSession>
export const jumpSession=createJumpSession()
export const previewLandingSurfaces=[
  ...DRAFT_PAVILIONS.map(p=>({x:p.x,z:p.z,halfX:4.5*p.scale,halfZ:4.5*p.scale,height:p.floor+6.2*p.scale})),
  {x:SITES.vr.x,z:SITES.vr.z,halfX:4.8,halfZ:6.5,height:5.2},
  {x:SITES.folk.x,z:SITES.folk.z,halfX:4.8,halfZ:6.5,height:5.2},
  {x:SITES.vrPagoda.x,z:SITES.vrPagoda.z,halfX:1.5,halfZ:1.5,height:14},
  {x:SITES.pagoda.x,z:SITES.pagoda.z,halfX:2,halfZ:2,height:29.8},
  {x:SITES.tower.x,z:SITES.tower.z,halfX:7.5,halfZ:7.5,height:18},
]
export function queueJump(s:JumpSession){s.bufferUntil=s.time+JUMP_RULES.buffer}
function message(s:JumpSession,text:string){s.banner=text;s.bannerUntil=s.time+2.4}
function grant(s:JumpSession,stage:number){const value=Math.min(JUMP_STAGES[stage]!.reward,100-s.today);s.today+=value;s.coins+=value;return value}
function finish(s:JumpSession,kind:JumpResult['kind']) {
  if(!s.active)return
  if(kind==='complete') {
    grant(s,6)
    s.hits.push({id:++s.hitSerial,pad:{...JUMP_PADS.at(-1)!,id:'layout-jump-finish-splash',x:s.x,z:s.z,height:DRAFT_LAKE.surfaceY,theme:'lily'},time:s.time,kind:'land'})
  }
  const elapsed=s.time-s.startedAt,best=kind==='complete'&&elapsed<s.bestTime
  if(best)s.bestTime=elapsed
  s.result={kind,stage:s.nextGate-1,coins:s.coins,time:elapsed,best,at:s.time};s.active=false;s.elapsed=elapsed
  message(s,kind==='complete'?'완주! · 호수 다이빙':kind==='water'?'호수에 빠졌어요':'떨어졌어요 · 걸어서 다시 도전해요')
}
export function landJumpPad(s:JumpSession,p:JumpPad) {
  if(p.id===JUMP_PADS[0]!.id&&!s.active) {
    const date=new Date(Date.now()+9*3600000).toISOString().slice(0,10)
    if(s.date!==date){s.date=date;s.today=0}
    s.active=true;s.nextGate=1;s.lastLeaf=false;s.startedAt=s.time;s.coins=0;s.maxHeight=p.height;s.result=null;s.navigate=false
    message(s,'출발! · 석탑 구간')
  }
  if(s.active&&p.gate===s.nextGate) {
    const reward=grant(s,p.stage);s.nextGate++
    message(s,`${p.gate}구간 통과 · +${reward}냥 · 다음 ${JUMP_STAGES[p.stage+1]!.name}`)
  }
  if(s.active&&s.nextGate===7&&p.id===JUMP_PADS.at(-1)!.id){s.lastLeaf=true;message(s,'마지막 연잎 · 엽전을 향해 호수로 뛰어드세요')}
  if(s.time-(s.seen.get(p.id)??-Infinity)>=.15) {
    s.hits.push({id:++s.hitSerial,pad:p,time:s.time,kind:'land'});s.seen.set(p.id,s.time)
    if(s.hits.length>24)s.hits.shift()
  }
}
function solidTop(x:number,z:number) {
  return Math.max(0,...previewLandingSurfaces.filter(p=>Math.abs(x-p.x)<p.halfX+.3&&Math.abs(z-p.z)<p.halfZ+.3).map(p=>p.height))
}
export function jumpCanMove(x:number,z:number,y:number) {
  if(!insideRoundedSquare(x,z,88.8,4.8))return false
  if(canWalk(x,z)&&walkHeight(x,z)<=y+JUMP_RULES.step)return true
  // The old layout walking box was deliberately generous; the planned VR tower has a 3m body.
  const dx=Math.abs(x-SITES.vrPagoda.x),dz=Math.abs(z-SITES.vrPagoda.z)
  if(dx<5.1&&dz<5.1&&(dx>=3.3||dz>=3.3))return true
  return y>=Math.max(3.7,solidTop(x,z))-.05
}
/** Fixed substeps, swept top-surface landing and edge-triggered jump buffering. Preview only. */
export function stepJump(s:JumpSession,dt:number,input:{x:number;z:number;fast?:boolean}) {
  let remaining=Math.min(.12,Math.max(0,dt))
  while(remaining>1e-7) {
    const h=Math.min(1/120,remaining);remaining-=h;s.time+=h
    const len=Math.hypot(input.x,input.z)||1,speed=s.swimming?(input.fast?6.25:4):(input.fast?9:6.25)
    const vx=s.manual?0:input.x/len*speed,vz=s.manual?0:input.z/len*speed
    s.vx=0;s.vz=0
    if(jumpCanMove(s.x+vx*h,s.z,s.y)){s.x+=vx*h;s.vx=vx}
    if(jumpCanMove(s.x,s.z+vz*h,s.y)){s.z+=vz*h;s.vz=vz}
    const water=swimmingAt(s.x,s.z),ground=walkHeight(s.x,s.z)
    if(s.grounded) {
      const surface=Math.max(ground,...previewLandingSurfaces.filter(p=>Math.abs(s.x-p.x)<=p.halfX&&Math.abs(s.z-p.z)<=p.halfZ&&p.height<=s.y+JUMP_RULES.step).map(p=>p.height))
      const supported=s.pad?containsJumpPad(s.pad,s.x,s.z):Math.abs(s.y-surface)<=JUMP_RULES.step
      if(!supported) {s.grounded=false;s.leftAt=s.time;s.pad=null}
      else if(!s.pad)s.y=surface
    }
    const coyote=!s.jumped&&!s.swimming&&s.time-s.leftAt<=JUMP_RULES.coyote
    if(!s.manual&&s.time<=s.bufferUntil&&!s.swimming&&(s.grounded||coyote)) {
      if(s.pad?.theme==='kite')s.hits.push({id:++s.hitSerial,pad:s.pad,time:s.time,kind:'leave'})
      s.vy=JUMP_RULES.speed;s.grounded=false;s.jumped=true;s.bufferUntil=-1e6;s.pad=null
    }
    if(!s.grounded) {
      const old=s.y;s.vy=Math.max(-JUMP_RULES.terminal,s.vy-JUMP_RULES.gravity*h);s.y+=s.vy*h
      if(s.vy<=0) {
        let floor=ground,landed:JumpPad|null=null,structure=false
        for(const p of previewLandingSurfaces)if(Math.abs(s.x-p.x)<=p.halfX&&Math.abs(s.z-p.z)<=p.halfZ&&p.height<=old+.02&&p.height>floor){floor=p.height;structure=true}
        for(const p of [...JUMP_PADS,...JUMP_GATES])if(p.height<=old+.02&&p.height>=s.y-.02&&p.height>floor&&containsJumpPad(p,s.x,s.z)){floor=p.height;landed=p;structure=false}
        if(s.y<=floor+.001) {
          s.y=floor;s.vy=0;s.grounded=true;s.jumped=false;s.pad=landed
          if(landed)landJumpPad(s,landed)
          else if(!structure&&!water)finish(s,'fall')
        }
      }
    }
    s.swimming=water&&s.y<.12
    if(s.swimming){finish(s,s.lastLeaf?'complete':'water');s.y=DRAFT_LAKE.surfaceY-.14;s.vy=0;s.grounded=true;s.pad=null;s.bufferUntil=-1e6}
    if(s.active){s.elapsed=s.time-s.startedAt;s.maxHeight=Math.max(s.maxHeight,s.y);if(s.elapsed>1800)finish(s,'fall')}
    if(s.navigate&&Math.hypot(s.x-JUMP_START.x,s.z-JUMP_START.z)<3)s.navigate=false
  }
}
