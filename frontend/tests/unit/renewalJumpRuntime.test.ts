import {afterAll,beforeEach,expect,it,vi} from 'vitest'
vi.stubEnv('MODE','park-renewal-integration')
const course=await import('../../src/features/jumpmap/course')
const {parseJumpEvent}=await import('../../src/features/jumpmap/protocol')
const {useJumpmap,resetJumpmap,bindJumpmap,acceptJumpEvent,applyJumpStatus}=await import('../../src/features/jumpmap/state')
const {renewalJumpMotion:m,syncJumpMotion,updateJumpContact,renewalPadAt}=await import('../../src/park-renewal/runtime/jumpMotion')
const {jumpPadPose}=await import('../../src/park-renewal/jumpGimmicks')
const {JUMP_SEQUENCE,DEV_JUMP_TRANSLATION,JUMP_REWARDS}=await import('../../src/park-renewal/jump10Plan')
const {DEV_JUMP_SIX}=await import('../../src/park-renewal/devJumpSixSnapshot')
const {RenewalPrediction}=await import('../../src/park-renewal/runtime/RenewalPrediction')
const {ParkMotion}=await import('../../src/network/parkMotion')
const scope={channelId:'test',mapVersion:course.MAP_VERSION},money={earningsDate:course.kstDate(),dailyCap:500,todayEarned:0}
const started={...scope,...money,revision:1,runId:'run',courseVersion:course.COURSE_VERSION,rulesVersion:course.RULES_VERSION,serverTime:1}
const receive=(type:string,p:object)=>acceptJumpEvent(parseJumpEvent(type,p)!)
let time=0
beforeEach(()=>{resetJumpmap();bindJumpmap('101',scope.channelId,scope.mapVersion);applyJumpStatus({...scope,...money,revision:0,enabled:true,courseVersion:course.COURSE_VERSION,rulesVersion:course.RULES_VERSION,isFirstRun:true,seenTips:[],activeRunId:null,bestFinishMs:null});time=0;vi.spyOn(Date,'now').mockImplementation(()=>time*1000);vi.spyOn(performance,'now').mockImplementation(()=>time*1000);syncJumpMotion()})
afterAll(()=>{vi.restoreAllMocks();vi.unstubAllEnvs()})
it('새 좌표의 10구간을 사용하고 기존 1~6단계의 크기·상대 간격·높이 차를 보존한다',()=>{
 expect(course.STAGE_COUNT).toBe(10);expect(course.COURSE_VERSION).toBe('park220-jump10-v1')
 for(const p of [...DEV_JUMP_SIX.pads,...DEV_JUMP_SIX.gates]){const b=course.COURSE.find(b=>b.sourceId===p.id)!;expect(b.x-p.x).toBeCloseTo(DEV_JUMP_TRANSLATION.x);expect(b.z-p.z).toBeCloseTo(DEV_JUMP_TRANSLATION.z);expect(b.top-p.height).toBeCloseTo(DEV_JUMP_TRANSLATION.y);expect(b.halfX).toBe(p.halfX);expect(b.halfZ).toBe(p.halfZ);expect(b.radius).toBe('radius'in p?p.radius:undefined)}
})
it('첫 발판만 충돌 가능하고 서버 시작 확인 뒤에 전체 코스가 충돌 가능하다',()=>{
 const a=JUMP_SEQUENCE[0]!,b=JUMP_SEQUENCE.find(p=>p.stage===6)!
 expect(renewalPadAt({x:a.x,y:a.height,z:a.z})?.id).toBe(a.id);expect(renewalPadAt({x:b.x,y:b.height,z:b.z})).toBeUndefined()
 receive('JUMPMAP_STARTED',started);syncJumpMotion();expect(renewalPadAt({x:b.x,y:b.height,z:b.z})?.id).toBe(b.id)
})
it('연잎은 연속 3초에 낙하하고 이탈하면 누적 대기를 초기화한다',()=>{
 receive('JUMPMAP_STARTED',started);const p=JUMP_SEQUENCE.find(p=>p.theme==='lily')!,feet={x:p.x,y:p.height,z:p.z}
 updateJumpContact(feet,0,0);updateJumpContact(feet,2.99,2.99);expect(jumpPadPose(p,m).solid).toBe(true)
 updateJumpContact(undefined,0,3);updateJumpContact(feet,0,4);updateJumpContact(feet,2.99,6.99);expect(jumpPadPose(p,m).solid).toBe(true)
 updateJumpContact(feet,.02,7.01);expect(jumpPadPose(p,m).solid).toBe(false);expect(jumpPadPose(p,m,7.3).height).toBeLessThan(p.height-.5)
})
it('두더지는 .48m 내려갔다 복귀하고 비둘기는 .42m 진폭으로 왕복하며 오리는 고정이다',()=>{
 receive('JUMPMAP_STARTED',started);const p=JUMP_SEQUENCE.find(p=>p.theme==='mole')!;updateJumpContact({x:p.x,y:p.height,z:p.z},0,10)
 expect(jumpPadPose(p,m,10.475).offset).toBeCloseTo(-.48);expect(jumpPadPose(p,m,10.96).offset).toBe(0)
 const bird=JUMP_SEQUENCE.find(p=>p.theme==='pigeon')!,duck=JUMP_SEQUENCE.at(-1)!
 expect(jumpPadPose(bird,m,0).offset).not.toBeCloseTo(jumpPadPose(bird,m,.95).offset);for(const t of[0,2,4])expect(jumpPadPose(duck,m,t).offset).toBe(0)
})
it('보상 10개는 엄격히 증가하며 중복 응답으로 더 받지 않고 확정 응답 합계만 250냥 표시한다',()=>{
 expect(course.REWARDS).toEqual([...JUMP_REWARDS]);expect(course.REWARDS.reduce((a,b)=>a+b,0)).toBe(250);course.REWARDS.slice(1).forEach((v,i)=>expect(v).toBeGreaterThan(course.REWARDS[i]!))
 receive('JUMPMAP_STARTED',started);let sum=0
 course.REWARDS.forEach((value,i)=>{sum+=value;const p={...scope,...money,todayEarned:sum,revision:i+2,runId:'run',gate:i+1,elapsedMs:1000*(i+1),coinsCalculated:value,coinsGranted:value,pending:false,runCoins:sum};receive('JUMPMAP_GATE',p);receive('JUMPMAP_GATE',p);expect(useJumpmap.getState().run?.runCoins).toBe(sum)})
 receive('JUMPMAP_ENDED',{...scope,...money,todayEarned:250,revision:12,runId:'run',reason:'FINISH',gatesPassed:10,maxHeight:50,runCoins:250,elapsedMs:10000,finishMs:10000,bestFinishMs:10000,newBest:true})
 expect(useJumpmap.getState().result?.runCoins).toBe(250);expect(useJumpmap.getState().run).toBeNull();expect(()=>parseJumpEvent('JUMPMAP_GATE',{...started,gate:11})).toThrow()
})
it('새 코스 첫 발판에 낙하 착지하고 시작 전의 상단 발판은 지지대로 사용하지 않는다',()=>{
 const p=JUMP_SEQUENCE[0]!,s=new RenewalPrediction();s.reset({x:p.x,y:p.height+1.2,z:p.z,yaw:0},-1,false)
 for(let i=0;i<80;i++){time+=1/60;s.step({dx:0,dz:0,run:false,jump:false},1/60)}
 expect(s.pose().y).toBeCloseTo(p.height+.8,4);expect(s.stepSupported()).toBe(true)
 const hidden=JUMP_SEQUENCE.find(p=>p.stage===6)!;s.reset({x:hidden.x,y:hidden.height+1,z:hidden.z,yaw:0},-1,false)
 for(let i=0;i<40;i++){time+=1/60;s.step({dx:0,dz:0,run:false,jump:false},1/60)}expect(s.pose().y).toBeLessThan(hidden.height+.7)
})
it('이동 충돌도 두더지·비둘기의 높이를 따라가며 3초 뒤 낙하한 연잎에서 떨어진다',()=>{
 receive('JUMPMAP_STARTED',started)
 for(const theme of ['mole','pigeon','lily']){
  const p=JUMP_SEQUENCE.find(p=>p.theme===theme)!,s=new RenewalPrediction();time+=10;syncJumpMotion();const top=jumpPadPose(p,m).height
  s.reset({x:p.x,y:top+.8,z:p.z,yaw:0},0,true);updateJumpContact({x:p.x,y:top,z:p.z},0,time)
  let lowest=Infinity
  for(let i=0;i<(theme==='lily'?210:75);i++){time+=1/60;const q=s.pose();updateJumpContact({x:q.x,y:q.y-.8,z:q.z},1/60,time);s.step({dx:0,dz:0,run:false,jump:false},1/60);lowest=Math.min(lowest,s.pose().y);if(theme!=='lily')expect(s.pose().y-.8).toBeCloseTo(jumpPadPose(p,m).height,4)}
  if(theme==='mole')expect(lowest).toBeLessThan(p.height+.5)
  if(theme==='lily'){expect(s.stepSupported()).toBe(false);expect(s.pose().y).toBeLessThan(p.height)}
 }
})
it('이전 7구간 서버 응답은 새 10구간 코스에 적용하지 않는다',()=>{
 applyJumpStatus({...scope,...money,revision:1,enabled:true,courseVersion:'park180-jump-v1',rulesVersion:'v3',isFirstRun:false,seenTips:[],activeRunId:null,bestFinishMs:null})
 expect(useJumpmap.getState().available).toBe(false)
})
it('인접 발판과 마지막 섬까지 달리기 점프의 상승량·체공 거리 안에서 이어진다',()=>{
 const route=[...JUMP_SEQUENCE,{...JUMP_SEQUENCE.at(-1)!,id:'island-finish',x:course.FINISH.x,z:course.FINISH.z,height:course.FINISH.y,halfX:1.8,halfZ:1.8}]
 for(let i=1;i<route.length;i++){
  const a=route[i-1]!,b=route[i]!,dx=b.x-a.x,dz=b.z-a.z,d=Math.hypot(dx,dz),input={dx:dx/d,dz:dz/d,run:true,jump:false},motion=new ParkMotion()
  for(let j=0;j<10;j++)motion.advance(input,.05,true)
  let height=a.height,travel=0,highest=height,reach=-1
  for(let j=0;j<600;j++){const p=motion.advance({...input,jump:j===0},.005,j===0);height+=p.y;travel+=Math.hypot(p.x,p.z);highest=Math.max(highest,height);if(j>0&&p.velocityY<=0&&height<=b.height){reach=travel;break}}
  const radius=(p:typeof a)=>p.radius??Math.min(p.halfX,p.halfZ)
  expect(highest+.03,`${a.id} → ${b.id} 상승량`).toBeGreaterThanOrEqual(b.height)
  expect(reach+radius(a)+radius(b),`${a.id} → ${b.id} 수평 거리`).toBeGreaterThanOrEqual(d)
 }
})
