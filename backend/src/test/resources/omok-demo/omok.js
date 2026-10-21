'use strict';
const $ = id => document.getElementById(id);
const ids = {black:'101',white:'202',viewer:'505'};
const names = {'101':'흑','202':'백'};
const pending = new Map();
let socket, config, gameId = null, version = -1, state = null, busy = false, restored = false, offset = 0;
let viewerReady = false, watchingGame = null, refreshing = null, polling = false;
const cells = [];
const role = $('role');
const requestedRole = new URLSearchParams(location.search).get('role');
if (Object.hasOwn(ids,requestedRole)) role.value = requestedRole;
function log(text) {
  const item=document.createElement('li'); item.textContent=new Date().toLocaleTimeString()+' · '+text;
  $('events').prepend(item); while ($('events').children.length>60) $('events').lastChild.remove();
}
function status(text,error=false) { $('status').textContent=text; $('status').classList.toggle('error',error); }
function open() { return socket?.readyState===WebSocket.OPEN; }
function remaining() { return state?.turnDeadline ? Math.max(0,Math.ceil((Date.parse(state.turnDeadline)-Date.now()-offset)/1000)) : null; }
function render() {
  const mine=ids[role.value]; const left=remaining();
  $('my-role').textContent=role.value==='viewer'?'관전자':names[mine];
  $('turn').textContent=state?.status==='FINISHED'?'경기 종료':names[state?.turnUserId]||'경기 대기';
  $('time').textContent=left===null?'—':left+'초';
  $('connect').disabled=socket && [WebSocket.OPEN,WebSocket.CONNECTING,WebSocket.CLOSING].includes(socket.readyState);
  $('connect').textContent=socket?'다시 연결하기':'연결하기';
  role.disabled=!!socket && socket.readyState!==WebSocket.CLOSED;
  $('disconnect').disabled=!open(); $('refresh').disabled=!open()||!gameId;
  $('new-game').disabled=!config||config.playing||busy;
  $('move-count').textContent=(state?.moveCount||0)+'수'; $('version').textContent='버전 '+(version<0?'—':version);
  for (const {button,x,y} of cells) {
    const stone=state?.board?.[y]?.[x]||0;
    button.disabled=!open()||!restored||busy||state?.status!=='PLAYING'||state.turnUserId!==mine||left===0||stone!==0;
    button.setAttribute('aria-label',String.fromCharCode(65+x)+(y+1)+(stone===1?' 흑':stone===2?' 백':' 빈칸'));
    button.replaceChildren();
    if (stone) { const dot=document.createElement('span'); dot.className='stone '+(stone===1?'black':'white')+(state.lastMove?.x===x&&state.lastMove?.y===y?' last':''); button.append(dot); }
  }
}
function applyState(id,v,data) {
  if(id!==gameId||!Number.isSafeInteger(v)||v<version||data?.gameCode!=='OMOK') return;
  version=v; state=data;
  if(state.status==='FINISHED') {
    const reason={FIVE_IN_ROW:'5목 완성',TURN_TIMEOUT:'30초 시간패',BOARD_FULL:'무승부',RECONNECT_EXPIRED:'재접속 유예 만료'}[state.endReason]||state.endReason;
    status((state.winnerUserId?names[state.winnerUserId]+' 승리 · ':'')+reason+' · 새 테스트 경기를 생성할 수 있어요.');
  } else status((role.value==='viewer'?'관전 중 · ':ids[role.value]===state.turnUserId?'내 차례예요. 빈 교차점을 눌러보세요.':'상대의 수를 기다리고 있어요.')+' · 끊겨도 턴 시간은 계속 흘러요.');
  render();
}
function send(type,payload={}) {
  if(!open()) return Promise.reject(new Error('먼저 연결해 주세요.'));
  const requestId=crypto.randomUUID();
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{pending.delete(requestId);reject(new Error('응답이 늦어요. 상태를 다시 조회해 주세요.'));},6000);
    pending.set(requestId,{resolve,reject,timer,type});
    socket.send(JSON.stringify({requestId,type,payload})); log('보냄 '+type);
  });
}
function receive(event) {
  let m; try {m=JSON.parse(event.data);} catch {status('서버 메시지를 읽을 수 없어요.',true);return;}
  log('받음 '+m.type+(m.payload?.code?' · '+m.payload.code:''));
  const p=m.payload||{};
  if(m.type==='GAME_STATE') applyState(p.gameId,p.version,p.publicState);
  if(m.type==='GAME_CONNECTION_STATE'&&p.status!=='PENDING') {
    restored=p.status==='RESTORED'&&p.gameId===gameId; if(p.state) applyState(p.gameId,p.version,p.state); render();
    // 조회 중의 재요청에는 PENDING만 올 수 있다. 최종 알림은 requestId=null이어도 같은 연결의 조회를 마친다.
    for(const [key,w] of pending) if(w.type==='GAME_RECONNECT_CHECK'){clearTimeout(w.timer);pending.delete(key);w.resolve(m);}
  }
  if(m.type==='GAME_WATCH_LEFT'&&p.gameId===watchingGame) watchingGame=null;
  const waiter=pending.get(m.requestId);
  if(waiter&&!(m.type==='GAME_CONNECTION_STATE'&&p.status==='PENDING')) {
    clearTimeout(waiter.timer); pending.delete(m.requestId);
    if(m.type==='ERROR') waiter.reject(new Error(friendly(p.code))); else waiter.resolve(m);
  } else if(m.type==='ERROR') status(friendly(p.code),true);
}
function friendly(code) {
  return ({GAME_ACTION_NOT_YOUR_TURN:'아직 내 차례가 아니에요.',GAME_ACTION_STALE_VERSION:'판이 바뀌었어요. 상태를 다시 조회해 주세요.',GAME_ACTION_INVALID_ACTION:'이미 둔 자리이거나 종료된 경기예요.',GAME_RECOVERY_REQUIRED:'경기 복구를 먼저 완료해야 해요.',GAME_STATE_ACCESS_DENIED:'관전 조건을 확인해 주세요.',GAME_ACTION_UNAVAILABLE:'착수 결과가 불확실해요. 재전송하지 말고 상태를 조회해 주세요.'})[code]||'요청 확인: '+code;
}
function refresh() {
  if(refreshing)return refreshing;
  refreshing=refreshState().finally(()=>{refreshing=null;});return refreshing;
}
async function refreshState() {
  if(!open()||!gameId) return;
  const target=gameId, connection=socket, currentRole=role.value;
  const current=()=>socket===connection&&gameId===target&&role.value===currentRole&&open();
  if(currentRole==='viewer') {
    await send('GAME_RECONNECT_CHECK');
    if(!current())return;
    if(!viewerReady){await send('CHANNEL_JOIN',{channelId:config.channelId});if(!current())return;await send('WORLD_MOVE',{sequence:Date.now(),x:0,y:0,z:0,yaw:0});if(!current())return;viewerReady=true;}
    if(watchingGame===target){await send('GAME_STATE_CHECK',{gameId:target});return;}
    if(watchingGame){await send('GAME_UNWATCH');if(!current())return;}
    await send('GAME_WATCH',{gameId:target});
    // 다른 탭에서 새 판을 만들어도 실제로 구독한 이전 대상 ID를 기록한다. poll이 이를 해제하고 새 판을 구독한다.
    if(socket===connection&&role.value===currentRole)watchingGame=target;
  } else {
    const recovery=await send('GAME_RECONNECT_CHECK');
    if(current()&&recovery.payload.status==='RESTORED'&&recovery.payload.gameId===target)await send('GAME_STATE_CHECK',{gameId:target});
  }
}
function connect() {
  if(socket&&socket.readyState!==WebSocket.CLOSED) return;
  restored=false;viewerReady=false;watchingGame=null; $('connection').textContent='연결 중';
  socket=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/ws/tables?demoRole='+role.value);
  socket.addEventListener('message',receive);
  socket.addEventListener('open',()=>{$('connection').textContent='연결됨';status('연결됐어요. 경기 상태를 확인하고 있어요.');render();refresh().catch(e=>{if(open())status(e.message,true);});});
  socket.addEventListener('close',event=>{
    restored=false;busy=false;$('connection').textContent='끊김';
    for(const w of pending.values()){clearTimeout(w.timer);w.reject(new Error('연결이 끊겼어요. 같은 역할로 다시 연결해 주세요.'));}pending.clear();
    status(event.code===1008?'같은 역할의 연결이 이미 열려 있어요. 다른 탭을 끊거나 역할을 바꿔주세요.':'연결이 끊겼어요. 같은 역할로 다시 연결하면 기존 판으로 돌아와요.',true);render();
  });
  socket.addEventListener('error',()=>status('테스트 서버에 연결할 수 없어요.',true)); render();
}
async function poll() {
  if(polling)return;polling=true;
  try {
    const result=await fetch('/dev/omok/config',{cache:'no-store'}); if(!result.ok) throw new Error();
    config=await result.json();offset=config.serverTime-Date.now();
    if(config.gameId!==gameId){gameId=config.gameId;version=-1;state=null;restored=false;if(open()) await refresh();}
    else if(open()&&config.playing&&((role.value!=='viewer'&&!restored)||(role.value==='viewer'&&watchingGame!==gameId)))await refresh();
    render();
  } catch {if(!config)status('테스트 서버 실행을 확인해 주세요.',true);}finally{polling=false;}
}
async function place(x,y) {
  if(busy||!restored||state?.status!=='PLAYING'||state.turnUserId!==ids[role.value]||state.board[y][x])return;
  const target=gameId, connection=socket;
  busy=true;render();
  try {const m=await send('GAME_ACTION_SEND',{gameId:target,actionId:crypto.randomUUID(),expectedVersion:version,input:{x,y}});if(socket===connection&&gameId===target&&version<m.payload.version)await send('GAME_STATE_CHECK',{gameId:target});}
  catch(e){if(open())status(e.message,true);}finally{busy=false;render();}
}
for(let x=0;x<15;x++){const label=document.createElement('span');label.textContent=String.fromCharCode(65+x);$('coordinates').append(label);}
for(let y=0;y<15;y++)for(let x=0;x<15;x++) {
  const button=document.createElement('button');button.className='cell';button.type='button';button.dataset.x=x;button.dataset.y=y;
  button.addEventListener('click',()=>place(x,y));$('board').append(button);cells.push({button,x,y});
}
$('connect').addEventListener('click',connect);
$('disconnect').addEventListener('click',()=>socket?.close(1000,'demo disconnect'));
addEventListener('pagehide',()=>socket?.close(1000,'demo page closed'));
$('refresh').addEventListener('click',()=>refresh().catch(e=>{if(open())status(e.message,true);}));
role.addEventListener('change',render);
$('new-game').addEventListener('click',async()=>{
  busy=true;render();
  try {const r=await fetch('/dev/omok/games',{method:'POST',headers:{'X-Omok-Demo':'local'}});if(!r.ok)throw new Error(r.status===409?'현재 경기 종료 후 새 판을 만들어 주세요.':'경기를 만들지 못했어요.');await poll();}
  catch(e){status(e.message,true);}finally{busy=false;render();}
});
render();poll();setInterval(poll,1000);setInterval(render,200);
