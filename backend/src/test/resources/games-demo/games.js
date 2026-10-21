'use strict';
const $=id=>document.getElementById(id);
const clients=new Map();
let config=null,gameId=null,offset=0,polling=false,creating=false;
const label=id=>({'101':'A','202':'B','505':'관전자'}[id]||id||'—');
const suits={hearts:'♥',diamonds:'♦',clubs:'♣',spades:'♠'};
function node(tag,text,className){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;}
function log(text){$('events').prepend(node('li',new Date().toLocaleTimeString()+' · '+text));while($('events').children.length>60)$('events').lastChild.remove();}
function button(text,action,disabled=false){const b=node('button',text);b.type='button';b.disabled=disabled;b.addEventListener('click',action);return b;}
function open(c){return c.socket?.readyState===WebSocket.OPEN;}
function error(c,text){c.error=text;render(c);}
function seconds(state){return state?.turnDeadline?Math.max(0,Math.ceil((Date.parse(state.turnDeadline)-Date.now()-offset)/1000)):null;}

for(const [role,id] of [['a','101'],['b','202'],['viewer','505']]){
  const c={role,id,socket:null,pending:new Map(),version:-1,state:null,privateState:{},restored:false,busy:false,error:'',selected:new Set(),ready:false,refreshing:null};
  if(role!=='viewer'){
    c.panel=node('section',undefined,'panel');c.panel.dataset.role=role;
    c.panel.append(node('h2','참가자 '+label(id)));
    c.connection=node('div',undefined,'connection');c.connectionText=node('span','연결 대기');
    c.connection.append(c.connectionText,button('다시 연결',()=>connect(c)),button('끊기',()=>c.socket?.close(1000,'demo disconnect')));
    c.status=node('p','경기 생성 후 자동으로 연결해요.','status');c.secret=node('div',undefined,'private');
    c.controls=node('div',undefined,'actions');c.content=node('div');c.detail=node('details');c.detail.append(node('summary','본인 개인 상태 JSON'));c.json=node('pre');c.detail.append(c.json);
    c.panel.append(c.connection,c.status,c.secret,c.content,c.controls,c.detail);$('players').append(c.panel);
  }
  clients.set(role,c);
}

function send(c,type,payload={}){
  if(!open(c))return Promise.reject(new Error('먼저 연결해 주세요.'));
  const requestId=crypto.randomUUID();
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{c.pending.delete(requestId);reject(new Error('응답이 늦어요. 상태 조회로 확인해 주세요.'));},6000);
    c.pending.set(requestId,{type,resolve,reject,timer,sawPending:false});
    c.socket.send(JSON.stringify({requestId,type,payload}));log(label(c.id)+' → '+type);
  });
}
function apply(c,p){
  if(p.gameId!==gameId||!Number.isSafeInteger(p.version)||p.version<c.version)return;
  if(p.version>c.version)c.selected.clear();
  c.version=p.version;c.state=p.publicState;c.privateState=p.privateState||{};render(c);
}
function receive(c,event){
  let m;try{m=JSON.parse(event.data);}catch{error(c,'서버 메시지를 읽지 못했어요.');return;}
  const p=m.payload||{};
  if(m.type==='GAME_STATE')apply(c,p);
  if(m.type==='GAME_CONNECTION_STATE'&&p.status==='PENDING'){
    c.restored=false;
    const waiting=c.pending.get(m.requestId);if(waiting)waiting.sawPending=true;
  }
  if(m.type==='GAME_CONNECTION_STATE'&&p.status!=='PENDING'){
    c.restored=p.status==='RESTORED'&&p.gameId===gameId;
    if(p.state)apply(c,{gameId:p.gameId,version:p.version,...(p.state.publicState?p.state:{publicState:p.state,privateState:{}})});
    // 자동 조회의 오래된 최종 알림이 수동 재조회보다 먼저 도착할 수 있다.
    // 해당 요청의 PENDING을 받은 뒤에만 requestId=null 최종 알림을 연결한다.
    for(const [id,w]of c.pending)if(w.type==='GAME_RECONNECT_CHECK'&&(m.requestId===id||(m.requestId===null&&w.sawPending))){clearTimeout(w.timer);c.pending.delete(id);w.resolve(m);}
  }
  const w=c.pending.get(m.requestId);
  if(w&&!(m.type==='GAME_CONNECTION_STATE'&&p.status==='PENDING')){
    clearTimeout(w.timer);c.pending.delete(m.requestId);
    if(m.type==='ERROR')w.reject(new Error(p.code+' · 최신 상태와 차례를 확인해 주세요.'));else w.resolve(m);
  }else if(m.type==='ERROR')error(c,p.code);
  if(m.type!=='CONNECTED')log(label(c.id)+' ← '+m.type+(p.code?' · '+p.code:''));
  render(c);
}
function connect(c){
  if(c.socket&&c.socket.readyState!==WebSocket.CLOSED)return;
  c.restored=false;c.ready=false;c.error='';
  const socket=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/ws/tables?testRole='+c.role);c.socket=socket;
  socket.addEventListener('message',event=>{if(c.socket===socket)receive(c,event);});
  socket.addEventListener('open',()=>refresh(c).catch(e=>error(c,e.message)));
  socket.addEventListener('error',()=>error(c,'테스트 서버 연결을 확인해 주세요.'));
  socket.addEventListener('close',event=>{
    if(c.socket!==socket)return;c.restored=false;c.busy=false;
    for(const w of c.pending.values()){clearTimeout(w.timer);w.reject(new Error('연결이 끊겼어요. 다시 연결해 주세요.'));}c.pending.clear();
    c.error=event.code===1008?'같은 테스트 역할이 다른 화면에서 연결돼 있어요.':'끊김 · 같은 역할로 다시 연결하면 남은 유예 안에 복귀해요.';render(c);
  });render(c);
}
function refresh(c){
  if(c.refreshing)return c.refreshing;
  const socket=c.socket,target=gameId;
  const current=()=>c.socket===socket&&gameId===target&&open(c);
  c.refreshing=(async()=>{
    if(!current()||!target)return;
    await send(c,'GAME_RECONNECT_CHECK');if(!current())return;
    if(c.role==='viewer'){
      if(!c.ready){await send(c,'CHANNEL_JOIN',{channelId:config.channelId});if(!current())return;await send(c,'WORLD_MOVE',{seq:1,dx:0,dz:0,run:false});if(!current())return;await send(c,'GAME_WATCH',{gameId:target});if(current())c.ready=true;}
      else await send(c,'GAME_STATE_CHECK',{gameId:target});
    }else if(c.restored)await send(c,'GAME_STATE_CHECK',{gameId:target});
  })().finally(()=>{c.refreshing=null;render(c);});return c.refreshing;
}
async function action(c,input){
  if(c.busy||!c.restored||!open(c))return;
  const socket=c.socket,target=gameId;c.busy=true;c.error='';render(c);
  try{
    const result=await send(c,'GAME_ACTION_SEND',{gameId:target,actionId:crypto.randomUUID(),expectedVersion:c.version,input});
    if(c.socket===socket&&gameId===target&&c.version<result.payload.version)await send(c,'GAME_STATE_CHECK',{gameId:target});
  }catch(e){error(c,e.message);if(open(c)&&gameId===target)await send(c,'GAME_STATE_CHECK',{gameId:target}).catch(()=>{});}
  finally{c.busy=false;render(c);}
}

function render(c){
  const s=c.state;
  if(c.role==='viewer'){
    $('watch-status').textContent=c.error||(open(c)?c.ready?'공개 상태 구독 중':'관전 준비 중':'연결 대기/끊김');
    $('watch-status').classList.toggle('error',!!c.error);
    $('public-json').textContent=s?JSON.stringify(s,null,2):'아직 경기가 없어요.';
    $('watch-private').textContent=JSON.stringify(c.privateState);
    $('public-summary').replaceChildren();
    if(s){
      $('public-summary').append(node('p',s.status==='FINISHED'?'종료 · '+(s.winnerUserIds?.map(label).join(', ')||label(s.winnerUserId))+' · '+s.endReason:'차례 '+label(s.turnUserId)+' · '+s.stage));
      if(s.gameCode==='DICE')s.players.forEach((id,i)=>$('public-summary').append(node('span',label(id)+' '+s.scores[i]+'점','badge')));
      else for(const p of s.players)$('public-summary').append(node('div',label(p.userId)+' · '+(s.gameCode==='ONE_CARD'?p.cardCount+'장':p.score+'점 / 골인 '+p.goals+'개')+(p.forfeited?' · 기권':''),'pawnline'));
      if(s.gameCode==='LIAR_BRIDGE'){
        $('public-summary').append(node('p','골인 슬롯: '+s.goalSlots.map(v=>v.slot+':'+(v.status==='UNUSED'?'빈칸':v.status==='VACATED'?'✕':label(v.userId))).join(' / ')));
        if(s.resolution)$('public-summary').append(node('p',s.resolution.challenged?'다우트 · 실제 '+s.resolution.actualFace+' · '+(s.resolution.wasBluff?'거짓말':'진실'):'모두 믿음 · 실제 눈 비공개'));
      }
    }return;
  }
  c.connectionText.textContent=open(c)?'● 연결됨':'○ 끊김';c.status.classList.toggle('error',!!c.error);
  const left=seconds(s);
  c.status.textContent=c.error||(!s?'경기 대기':s.status==='FINISHED'?'종료 · '+s.endReason:'버전 '+c.version+' · '+s.stage+' · '+(left===null?'':left+'초')+' · '+(s.responderUserId?'판단 '+label(s.responderUserId):'차례 '+label(s.turnUserId)));
  c.secret.replaceChildren();c.controls.replaceChildren();c.content.replaceChildren();c.json.textContent=JSON.stringify(c.privateState,null,2);
  const valid=open(c)&&c.restored&&!c.busy&&s?.status==='PLAYING'&&left!==0;
  const mine=valid&&s.turnUserId===c.id;
  if(!s)return;
  c.controls.append(button('상태 조회',()=>refresh(c).catch(e=>error(c,e.message)),!open(c)||c.busy));
  if(s.gameCode==='DICE'){
    c.secret.append(node('p','이번 차례 점수 '+s.turnScore+' · 목표 '+s.targetScore));
    for(const die of s.dice){
      const box=node('label',undefined,'dice');const check=node('input');check.type='checkbox';check.checked=c.selected.has(die.id);check.disabled=!mine||die.held;
      check.setAttribute('aria-label',label(c.id)+' 주사위 '+die.id+' 선택');
      check.addEventListener('change',()=>{if(check.checked)c.selected.add(die.id);else c.selected.delete(die.id);});box.append(check,node('span',die.value+(die.held?' ✓':'')));c.content.append(box);
    }
    c.controls.append(button('굴리기',()=>action(c,{kind:'roll',selectedIds:[...c.selected]}),!mine),button('점수 저장 (Bank)',()=>action(c,{kind:'bank',selectedIds:[...c.selected]}),!mine||s.stage!=='SELECTING'));
    c.content.append(node('p','첫 굴림은 선택 없이, 다음 굴림·저장은 득점 주사위를 선택해요.','note'));
  }else if(s.gameCode==='ONE_CARD'){
    c.secret.append(node('p','내 손패 · 다른 참가자에게는 장수만 보여요.'));
    c.content.append(node('p','바닥 '+cardLabel(s.topCard)+' · 무늬 '+suits[s.activeSuit]+' · 누적 공격 '+s.attackTotal));
    const hand=node('div',undefined,'cards');
    for(const card of c.privateState.hand||[]){const b=button(cardLabel(card),()=>action(c,{kind:'play',cardId:card.id}),!mine||!c.privateState.playableCardIds?.includes(card.id));b.dataset.cardId=card.id;if(['hearts','diamonds'].includes(card.suit))b.classList.add('red');hand.append(b);}c.content.append(hand);
    c.controls.append(button(s.attackTotal?'공격 받기 ('+s.attackTotal+'장)':'한 장 뽑고 넘기기',()=>action(c,{kind:s.attackTotal?'accept-attack':'draw'}),!mine||s.stage!=='PLAYING'));
    if(s.stage==='CHOOSE_SUIT')for(const suit of Object.keys(suits))c.controls.append(button(suits[suit]+' 선택',()=>action(c,{kind:'select-suit',suit}),!mine));
    const me=s.players.find(p=>p.userId===c.id);
    c.controls.append(button('원카드 선언',()=>action(c,{kind:'declare-one'}),!valid||me?.oneCardStatus!=='pending'||Date.parse(me.oneCardUntil)<=Date.now()+offset));
    for(const p of s.players.filter(p=>p.userId!==c.id&&p.oneCardStatus==='pending'))c.controls.append(button(label(p.userId)+' 미선언 신고',()=>action(c,{kind:'catch-one',targetUserId:p.userId}),!valid||Date.parse(p.oneCardUntil)<=Date.now()+offset));
  }else if(s.gameCode==='LIAR_BRIDGE'){
    c.secret.append(node('p','나만 보는 비밀 눈'),node('strong',c.privateState.die??'—'));
    c.content.append(node('p',s.declaration?'선언 '+s.declaration+' · 판단 '+label(s.responderUserId):'비밀 주사위를 굴린 후1~4를 선언해요.'));
    const me=s.players.find(p=>p.userId===c.id);c.content.append(node('p','내 말: '+me.pawns.map(p=>p.status==='ACTIVE'?'현재 '+p.position+'칸':p.status==='RESERVE'?'예비':p.status==='SCORED'?p.goalSlot+'점':p.status==='FALLEN'?'추락':'제외').join(' / ')));
    c.controls.append(button('비밀 주사위 굴리기',()=>action(c,{kind:'roll'}),!mine||s.stage!=='AWAITING_ROLL'));
    for(let value=1;value<=4;value++)c.controls.append(button(value+' 선언',()=>action(c,{kind:'declare',value}),!mine||s.stage!=='DECLARING'));
    const judge=valid&&s.stage==='RESPONDING'&&s.responderUserId===c.id;
    c.controls.append(button('믿기',()=>action(c,{kind:'trust'}),!judge),button('다우트!',()=>action(c,{kind:'doubt'}),!judge));
  }
}
function cardLabel(card){return card?card.rank==='joker-black'?'JOKER':card.rank==='joker-color'?'🌈 JOKER':(suits[card.suit]||'')+card.rank:'—';}

async function poll(){
  if(polling)return;polling=true;
  try{
    const response=await fetch('/dev/games/config',{cache:'no-store'});if(!response.ok)throw new Error('서버 확인 필요');
    config=await response.json();offset=config.serverTime-Date.now();
    if(config.gameId!==gameId){
      gameId=config.gameId;
      for(const c of clients.values()){
        if(c.socket){const old=c.socket;c.socket=null;old.close(1000,'new test match');for(const w of c.pending.values()){clearTimeout(w.timer);w.reject(new Error('새 경기로 전환했어요.'));}c.pending.clear();}
        c.state=null;c.privateState={};c.version=-1;c.restored=false;c.ready=false;c.busy=false;c.refreshing=null;c.selected.clear();if(gameId)connect(c);else render(c);
      }
    }
    $('summary').textContent=!gameId?'게임을 고르고 생성해 주세요.':config.gameCode+' · '+(config.playing?'진행 중':'종료');
    $('create').disabled=creating||config.playing;$('game').disabled=creating||config.playing;$('forfeit').disabled=creating||!config.playing;
  }catch(e){$('summary').textContent='테스트 서버 실행을 확인해 주세요.';}finally{polling=false;}
}
$('create').addEventListener('click',async()=>{
  if(creating)return;creating=true;$('create').disabled=true;
  try{const r=await fetch('/dev/games/matches?code='+encodeURIComponent($('game').value),{method:'POST',headers:{'X-Games-Demo':'local'}});if(!r.ok)throw new Error(r.status===409?'현재 경기 종료 후 생성해 주세요.':'생성 실패');await poll();}
  catch(e){$('summary').textContent=e.message;}finally{creating=false;$('create').disabled=!!config?.playing;}
});
$('forfeit').addEventListener('click',async()=>{
  if(creating)return;creating=true;
  try{const r=await fetch('/dev/games/forfeit',{method:'POST',headers:{'X-Games-Demo':'local'}});if(!r.ok)throw new Error('기권 요청 실패');await poll();log('테스트 서버에 모두 기권 요청. 진행 선언은 판정/마감 뒤 반영해요.');}
  catch(e){$('summary').textContent=e.message;}finally{creating=false;}
});
addEventListener('pagehide',()=>{for(const c of clients.values())c.socket?.close(1000,'demo closed');});
poll();setInterval(poll,1000);
// 타이머 표시만 갱신한다. 버튼·체크박스를 매 프레임 교체하면 선택/클릭 중 포커스가 사라진다.
setInterval(()=>{for(const c of clients.values())if(c.role!=='viewer'&&c.state&&!c.error&&c.state.status==='PLAYING'){
  const s=c.state;c.status.textContent='버전 '+c.version+' · '+s.stage+' · '+seconds(s)+'초 · '+(s.responderUserId?'판단 '+label(s.responderUserId):'차례 '+label(s.turnUserId));
}},200);
