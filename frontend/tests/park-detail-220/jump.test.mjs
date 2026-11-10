import test from 'node:test'
import assert from 'node:assert/strict'
import {JUMP_STAGES,JUMP_PADS,JUMP_GATES,JUMP_SEQUENCE,JUMP_FINISH,isJumpPadVisible} from '../../src/park-renewal/jump10Plan.ts'
import {createJumpState,queueJump,stepJump,landPad} from '../../src/park-renewal/jump10Simulation.ts'
test('기존 7개 테마를 유지하고 두더지·비둘기·오리 3단계를 추가',()=>{
 assert.deepEqual(JUMP_STAGES.map(s=>s.theme),['stone','gomoku','fish','cloud','lantern','kite','lily','mole','pigeon','duck']);assert.equal(JUMP_GATES.length,9)
 assert.equal(JUMP_PADS.length,169)
})
test('첫 발판만 보이고 착지로 시작하면 전체 코스를 공개',()=>{
 const s=createJumpState();assert.equal(JUMP_SEQUENCE.filter(p=>isJumpPadVisible(p,s.active)).length,1)
 landPad(s,JUMP_PADS.at(-1));assert.equal(s.active,false)
 landPad(s,JUMP_PADS[0]);assert.equal(s.active,true);assert.equal(JUMP_SEQUENCE.filter(p=>isJumpPadVisible(p,s.active)).length,JUMP_SEQUENCE.length)
})
test('기믹과 이동 발판을 기존 달리기·점프 물리로 순서대로 완주 가능',()=>{
 const s=createJumpState();let longest=0,previous={x:s.x,z:s.z}
 for(const target of JUMP_SEQUENCE){longest=Math.max(longest,Math.hypot(previous.x-target.x,previous.z-target.z));queueJump(s);let landed=false
  for(let i=0;i<480;i++){const dx=target.x-s.x,dz=target.z-s.z,near=Math.hypot(dx,dz)<.055;stepJump(s,1/120,{x:near?0:dx,z:near?0:dz,fast:true});if(s.grounded&&s.pad?.id===target.id){landed=true;break}if(s.phase==='fall')break}
  assert.ok(landed,`${target.id}: ${s.pad?.id??'바닥'} (${s.x.toFixed(2)},${s.y.toFixed(2)},${s.z.toFixed(2)})`);previous=target
 }
 assert.ok(longest>3.5);assert.equal(s.nextGate,10);assert.equal(s.finalDuck,true)
 for(let i=0;i<240&&s.phase!=='complete';i++){const dx=JUMP_FINISH.x-s.x,dz=JUMP_FINISH.z-s.z,near=Math.hypot(dx,dz)<.1;stepJump(s,1/120,{x:near?0:dx,z:near?0:dz,fast:false})}assert.equal(s.phase,'complete')
})
test('관문 건너뛰기와 호수로 바로 떨어지는 경우 완주가 아님',()=>{
 const s=createJumpState();landPad(s,JUMP_PADS[0]);landPad(s,JUMP_GATES[8]);landPad(s,JUMP_PADS.at(-1));assert.equal(s.finalDuck,false)
 Object.assign(s,{x:JUMP_FINISH.x,z:JUMP_FINISH.z,y:10,grounded:false});for(let i=0;i<240;i++)stepJump(s,1/120,{x:0,z:0,fast:false});assert.equal(s.phase,'fall');assert.equal(JUMP_SEQUENCE.filter(p=>isJumpPadVisible(p,s.active)).length,1)
})

test('1~6단계 원본과 새 연잎·두더지·비둘기·오리를 구간별 이동 속도로 완주 가능',()=>{
 const s=createJumpState();for(const target of JUMP_SEQUENCE){queueJump(s);let landed=false;for(let i=0;i<480;i++){const dx=target.x-s.x,dz=target.z-s.z,near=Math.hypot(dx,dz)<.055;stepJump(s,1/120,{x:near?0:dx,z:near?0:dz,fast:target.stage!==6});if(s.grounded&&s.pad?.id===target.id){landed=true;break}if(s.phase==='fall')break}assert.ok(landed,target.id)}assert.equal(s.nextGate,10)
})
