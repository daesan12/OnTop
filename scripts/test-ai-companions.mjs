// Real loopback sockets + authoritative rules/Rapfi. All external providers explicitly disabled.
import {spawn} from 'node:child_process'
import {readFile,writeFile,mkdir,open} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import net from 'node:net'
const repo=fileURLToPath(new URL('../',import.meta.url)),backend=path.join(repo,'backend')
const output=path.resolve(process.argv[2]??path.join(backend,'.gradle/ai-park-benchmark','companions-'+Date.now()))
await mkdir(output,{recursive:false})
await new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(19192,'127.0.0.1',()=>server.close(resolve))})
const base='http://127.0.0.1:19192',pause=ms=>new Promise(r=>setTimeout(r,ms)),checks=[]
let currentGameId=''
function check(name,value){checks.push({name,pass:!!value});if(!value)throw Error(name);console.log('PASS '+name)}
async function http(url,token,body,expected=200){if(url==='/local/ai/companions/action')body={gameId:currentGameId,...body};const r=await fetch(base+url,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(7000)});if(r.status!==expected)throw Error(url+' status '+r.status);return r.json()}
async function until(read,test,limit=16000){const start=performance.now();while(performance.now()-start<limit){const v=await read();if(test(v))return v;await pause(200)}throw Error('Condition timeout')}
async function connect(role){
 const grant=await http('/dev/alkkagi-park/session',null,{role}),{accessToken:token}=await http('/api/v1/auth/exchange',null,grant),{ticket}=await http('/api/v1/auth/websocket-ticket',token,{})
 const ws=new WebSocket('ws://127.0.0.1:19192/ws/tables?ticket='+ticket),events=[],pending=new Map();let serial=0
 const ready=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('CONNECTED timeout')),8000);ws.addEventListener('message',e=>{const m=JSON.parse(e.data);events.push({...m,receivedAt:performance.now()});if(m.type==='CONNECTED'){clearTimeout(timer);resolve(m.payload)}const p=pending.get(m.requestId);if(p){clearTimeout(p.timer);pending.delete(m.requestId);p.resolve(m)}});ws.addEventListener('error',()=>reject(Error('socket error')),{once:true})})
 const request=(type,payload={})=>new Promise((resolve,reject)=>{if(ws.readyState!==WebSocket.OPEN){reject(Error('socket closed'));return}const requestId='c'+(++serial),timer=setTimeout(()=>{pending.delete(requestId);reject(Error(type+' timeout'))},8000);pending.set(requestId,{resolve,reject,timer});ws.send(JSON.stringify({type,requestId,payload}))})
 const hello=await ready;await request('WORLD_MAP_CONFIRM',hello.map);await request('CHANNEL_JOIN',{channelId:'channel-1'});await request('WORLD_TIME_CHECK')
 return {token,events,request,close(){for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('closed'))}pending.clear();ws.close()}}
}
const env={...process.env,AI_PARK_BENCHMARK:'on',AI_PARK_BENCHMARK_DIRECTORY:path.join(output,'state'),AI_PARK_BENCHMARK_LIVE_JEV:'false',AI_PARK_BENCHMARK_LIVE_MM:'false',AI_PARK_BENCHMARK_LIVE_LLM:'false'}
delete env.OPENAI_API_KEY;delete env.JEV_API_KEY;delete env.AI_LAB_MM_WEBHOOK
const cp=(await readFile(path.join(backend,'build/ai-lab/classpath.txt'),'utf8')).trim(),log=await open(path.join(output,'server.log'),'w')
const server=spawn('java.exe',['-Xmx768m','-cp',cp,'com.ssafy.ontop.demo.AiParkApplication'],{cwd:backend,windowsHide:true,stdio:['ignore',log.fd,log.fd],env})
const clients=[];let heartbeat,result={at:new Date().toISOString(),externalProviders:false,checks}
const status=c=>http('/local/ai/companions/status',c.token)
async function place(c,index=0){const p=await http('/local/ai/table-position?index='+index,c.token,{});await c.request('WORLD_TIME_CHECK');const joined=await c.request('TABLE_JOIN',{tableId:p.tableId});check('real TABLE_JOIN '+index,joined.type==='TABLE_STATE');return p.tableId}
try{
 await until(async()=>{if(server.exitCode!==null)throw Error('server exited');try{return await http('/actuator/health')}catch{return null}},v=>v?.status==='UP',30000)
 const a=await connect('red'),b=await connect('green'),outside=await connect('viewer');clients.push(a,b,outside)
 heartbeat=setInterval(()=>{for(const c of clients)c.request('WORLD_TIME_CHECK').catch(()=>{})},1000)
 console.log('Observing random roaming and rests for 32 seconds')
 const roamAt=performance.now(),roaming=[]
 while(performance.now()-roamAt<32000){
  const elder=(await status(a)).actors.find(n=>n.id==='omok-channel-1'),police=(await http('/local/ai/status',a.token)).npcs?.['channel-1']
  if(elder&&police)roaming.push({ms:Math.round(performance.now()-roamAt),elder,police})
  await pause(250)
 }
 result.roaming=roaming
 check('elder stays in the central plaza while idle',roaming.length>30&&roaming.every(p=>p.elder.x>=-32&&p.elder.x<=32&&p.elder.z>=-24&&p.elder.z<=64))
 check('elder alternates walking and looking around',roaming.some(p=>p.elder.action==='REST')&&roaming.some(p=>p.elder.moving))
 check('police takes breaks without losing patrol',roaming.some(p=>p.police.action==='REST')&&roaming.some(p=>p.police.moving))
 const packets=a.events.filter(e=>e.type==='WORLD_AI_COMPANIONS'),gaps=packets.slice(1).map((p,i)=>p.receivedAt-packets[i].receivedAt).sort((a,b)=>a-b)
 result.roamingCadence={packets:packets.length,medianGapMs:gaps[Math.floor(gaps.length/2)],p95GapMs:gaps[Math.floor(gaps.length*.95)]}
 check('movement comes over the socket without waiting for HTTP polls',packets.length>100&&result.roamingCadence.medianGapMs<200)
 const table=await place(a);let t=await a.request('GAME_SELECT',{gameCode:'OMOK',betAmountPerPlayer:0});check('select OMOK 0',t.type==='TABLE_STATE')
 const invited=await http('/local/ai/companions/invite',a.token,{difficulty:'NORMAL'});currentGameId=invited.snapshot.gameId;check('manual invite zero coin',invited.bet===0);check('resident reserves before walking',invited.phase==='ARRIVING'&&invited.name==='이평범')
 const repeat=await http('/local/ai/companions/invite',a.token,{difficulty:'HARD'});check('invite idempotent',repeat.snapshot.gameId===invited.snapshot.gameId)
 check('other player has no practice access',!(await status(b)).practice)
 await http('/local/ai/companions/action',b.token,{kind:'stop'},409)
 const forbiddenJoin=await b.request('TABLE_JOIN',{tableId:table});check('NPC seat prevents other player joining',forbiddenJoin.type==='ERROR'&&forbiddenJoin.payload.code==='NPC_PRACTICE_ACTIVE')
 await http('/local/ai/companions/action',a.token,{kind:'place',version:0,actionId:'too-early',x:7,y:7},409)
 const arrivalTrace=[],arrivalAt=performance.now();await until(async()=>{const value=await status(a),actor=value.actors.find(n=>n.id===invited.actorId);if(actor)arrivalTrace.push({ms:performance.now()-arrivalAt,x:actor.x,z:actor.z,moving:actor.moving,seated:actor.seated});return value},s=>s.practice?.phase==='PLAYING',65000)
 result.arrival={trace:arrivalTrace,elapsedMs:performance.now()-arrivalAt};check('resident walks before sitting',arrivalTrace.some(n=>n.moving&&!n.seated)&&arrivalTrace.at(-1)?.seated)
 await http('/local/ai/companions/action',a.token,{kind:'place',version:0,actionId:'first-move',x:7,y:7})
 let s=await until(()=>status(a),s=>s.practice?.snapshot.board.moveCount===2&&!s.practice.thinking)
 check('NPC replies with legal move',s.practice.snapshot.turnUserId===101)
 check('three unique residents plus existing police',s.actors.length===3&&new Set(s.actors.map(a=>a.id)).size===3)
 const generated=JSON.parse(await readFile(path.join(repo,'frontend/generated/park/server-map.json'),'utf8')),tablePoint=generated.data.tables[0].position
 const actor=s.actors.find(n=>n.id===invited.actorId)
 check('NPC sits at actual generated table',actor?.seated&&Math.abs(actor.x-tablePoint[0])<.01&&Math.abs(actor.z-(tablePoint[2]-1.25))<.01)
 await until(async()=>a.events,e=>e.some(m=>m.type==='WORLD_AI_COMPANION_SPEECH'&&m.payload.actorId===invited.actorId))
 check('NPC commentary reaches real chat',a.events.some(m=>m.type==='WORLD_AI_COMPANION_SPEECH'&&m.payload.actorId===invited.actorId))
 // Owner and an approved TABLE_WATCH spectator share one private practice chat; nearby outsiders do not.
 await http('/local/ai/table-position',b.token,{});await http('/local/ai/table-position',outside.token,{})
 const watchAck=await b.request('TABLE_WATCH',{tableId:table});check('practice spectator admitted',watchAck.type==='TABLE_WATCH_STATE')
 check('practice spectator has isolated scope',(await status(b)).practiceChat?.gameId===currentGameId)
 const forged=await outside.request('GAME_SPECTATOR_CHAT_SEND',{gameId:currentGameId,eventId:crypto.randomUUID(),text:'forged'})
 check('outsider cannot inject private practice chat',forged.type==='ERROR'&&forged.payload.code==='GAME_SPECTATOR_ACCESS_DENIED')
 const privateId=crypto.randomUUID(),privateMessage=await a.request('GAME_SPECTATOR_CHAT_SEND',{gameId:currentGameId,eventId:privateId,text:'연습판 전용 대화'})
 check('practice chat accepted',privateMessage.type==='GAME_SPECTATOR_CHAT_MESSAGE')
 await pause(150)
 check('spectator receives private chat',b.events.some(e=>e.type==='GAME_SPECTATOR_CHAT_MESSAGE'&&e.payload.eventId===privateId))
 check('outside does not receive private chat',!outside.events.some(e=>e.type==='GAME_SPECTATOR_CHAT_MESSAGE'&&e.payload.eventId===privateId))
 const collision=await a.request('GAME_SPECTATOR_CHAT_SEND',{gameId:currentGameId,eventId:privateId,text:'different'})
 check('practice duplicate ID preserves policy error',collision.type==='ERROR'&&collision.payload.code==='GAME_SPECTATOR_EVENT_ID_CONFLICT')
 const limit=await a.request('GAME_SPECTATOR_CHAT_SEND',{gameId:currentGameId,eventId:crypto.randomUUID(),text:'too-fast'})
 check('practice rate limit preserves policy error',limit.type==='ERROR'&&limit.payload.code!=='INTERNAL_ERROR')
 const wrongScope=await a.request('WORLD_CHAT_SEND',{text:'wrong world scope'})
 check('practice owner cannot bypass private scope',wrongScope.type==='ERROR'&&wrongScope.payload.code==='GAME_CHAT_REQUIRED')
 const worldAck=await outside.request('WORLD_CHAT_SEND',{text:'바깥 전용 대화'})
 await pause(150)
 check('outside chat does not enter player or spectator scope',worldAck.type==='WORLD_CHAT_MESSAGE'&&![a,b].some(c=>c.events.some(e=>e.type==='WORLD_CHAT_MESSAGE'&&e.payload.messageId===worldAck.payload.messageId)))
 result.engine=s.engine;result.firstAnalysis=s.practice.analysis
 for(const kind of ['undoRequest','drawRequest'])check(kind+' rejected',(await http('/local/ai/companions/action',a.token,{kind})).rejected===true)
 await http('/local/ai/companions/action',a.token,{kind:'place',version:0,actionId:'stale',x:6,y:7},409)
 check('stale action did not change board',(await status(a)).practice.snapshot.board.moveCount===2)
 // Practice games are local leases, not approved product game sessions. Observer speech must use nearby world scope.
 const witnessAt=performance.now();let nextPracticeMove=witnessAt+12000,practiceExtra=0
 const witness=()=>a.events.find(e=>e.type==='WORLD_AI_COMPANION_SPEECH'&&e.payload.actorId!==invited.actorId&&e.payload.incidentId.includes(currentGameId))
 while(!witness()&&performance.now()-witnessAt<80000){
  const value=await status(a);if(value.practice?.snapshot.endedAt)throw Error('Practice ended before witness speech')
  if(performance.now()>=nextPracticeMove&&!value.practice.thinking){
   const board=value.practice.snapshot.board,forbidden=board.forbiddenMoves
   const candidates=[[0,0],[14,14],[0,2],[14,12],[0,4],[14,10],[2,0],[12,14],[4,0],[10,14]]
   const p=candidates.find(([x,y])=>board.board[y][x]===0&&!forbidden.some(q=>q.x===x&&q.y===y))
   if(!p)throw Error('No legal practice keepalive move')
   await http('/local/ai/companions/action',a.token,{kind:'place',version:value.practice.snapshot.version,actionId:'practice-extra-'+practiceExtra++,x:p[0],y:p[1]});nextPracticeMove=performance.now()+12000
  }
  await pause(250)
 }
 check('outside cannot hear NPC practice commentary',!outside.events.some(e=>e.type==='WORLD_AI_COMPANION_SPEECH'&&e.payload.gameId===currentGameId))
 result.practiceWitness=witness()?.payload;check('private player receives another residents practice commentary',!!witness()&&witness().payload.gameId===currentGameId)
 // Observe the original 30s human turn timeout, not an accelerated test clock.
 const timeout=await until(()=>status(a),s=>!!s.practice?.snapshot.endedAt,34000)
 check('real turn timeout',timeout.practice.snapshot.endReason==='TURN_TIMEOUT')
 await http('/local/ai/companions/action',a.token,{kind:'stop'});check('stop releases NPC',!(await status(a)).practice)
 for(const difficulty of ['EASY','HARD']){
  const invitation=await http('/local/ai/companions/invite',a.token,{difficulty});currentGameId=invitation.snapshot.gameId
  const ready=await until(()=>status(a),v=>v.practice?.phase==='PLAYING',65000)
  check('correct physical opponent '+difficulty,ready.practice.name===(difficulty==='EASY'?'김잼민':'박영감')&&ready.actors.some(n=>n.id===invitation.actorId&&n.seated))
  await http('/local/ai/companions/action',a.token,{kind:'place',version:0,actionId:'move-'+difficulty,x:7,y:7})
  const moved=await until(()=>status(a),v=>v.practice?.snapshot.board.moveCount===2&&!v.practice.thinking)
  check('legal reply with persona '+difficulty,moved.practice.snapshot.turnUserId===101&&moved.practice.speech.length>0)
  await http('/local/ai/companions/action',a.token,{kind:'stop'})
 }
 await b.request('TABLE_UNWATCH');await a.request('TABLE_LEAVE');await pause(500)
 const autoTable=await place(a,1);await a.request('GAME_SELECT',{gameCode:'OMOK',betAmountPerPlayer:0});const started=performance.now()
 const automatic=await until(()=>status(a),s=>!!s.practice,34000);result.autoWaitMs=performance.now()-started
 check('30s automatic normal resident invitation',automatic.practice.snapshot.tableId===autoTable&&automatic.practice.name==='이평범'&&result.autoWaitMs>=29000)
 a.close();await pause(1200);await http('/local/ai/table-position?index=1',b.token,{});
 const released=await b.request('TABLE_WATCH',{tableId:autoTable});result.releaseResponse=released.type==='ERROR'?released.payload:released.type;
 check('disconnect releases NPC',released.type==='TABLE_WATCH_STATE'&&released.payload.seats.every(s=>s.userId===null))
 await b.request('TABLE_UNWATCH');const a2=await connect('red');clients.push(a2);await place(a2);await place(b)
 t=await a2.request('GAME_SELECT',{gameCode:'OMOK',betAmountPerPlayer:0});check('human game selection',t.type==='TABLE_STATE')
 let version=t.payload.version;await a2.request('READY_SET',{ready:true,betAmountPerPlayer:0,expectedVersion:version});await b.request('READY_SET',{ready:true,betAmountPerPlayer:0,expectedVersion:version})
 const game=await until(async()=>a2.events.filter(e=>e.type==='GAME_START_STATE'&&e.payload.gameSessionId).at(-1),e=>e?.payload.phase==='PLAYING',15000)
 result.humanGameId=game.payload.gameSessionId;check('real human OMOK started',!!result.humanGameId)
 const humanEvent=crypto.randomUUID();const humanChat=await a2.request('GAME_SPECTATOR_CHAT_SEND',{gameId:result.humanGameId,eventId:humanEvent,text:'정식 경기 전용 대화'})
 check('human player uses game chat',humanChat.type==='GAME_SPECTATOR_CHAT_MESSAGE');await pause(150)
 check('outside cannot hear human game chat',!outside.events.some(e=>e.type==='GAME_SPECTATOR_CHAT_MESSAGE'&&e.payload.eventId===humanEvent))
 const external=await outside.request('WORLD_CHAT_SEND',{text:'경기 밖 대화'});await pause(150)
 result.humanOutside={type:external.type,code:external.payload.code,received:[a2,b].map(c=>c.events.some(e=>e.type==='WORLD_CHAT_MESSAGE'&&e.payload.messageId===external.payload.messageId))}
 check('human players do not receive outside world chat',external.type==='WORLD_CHAT_MESSAGE'&&![a2,b].some(c=>c.events.some(e=>e.type==='WORLD_CHAT_MESSAGE'&&e.payload.messageId===external.payload.messageId)))
 await outside.request('TABLE_WATCH',{tableId:table});const approved=await outside.request('GAME_WATCH',{gameId:result.humanGameId});check('real game spectator approved',approved.type==='GAME_STATE')
 const spectatorEvent=crypto.randomUUID();await pause(1100);const spectatorChat=await outside.request('GAME_SPECTATOR_CHAT_SEND',{gameId:result.humanGameId,eventId:spectatorEvent,text:'승인 관전자 전용 대화'})
 check('approved spectator can chat with players',spectatorChat.type==='GAME_SPECTATOR_CHAT_MESSAGE');await pause(150)
 check('player receives approved spectators chat',a2.events.some(e=>e.type==='GAME_SPECTATOR_CHAT_MESSAGE'&&e.payload.eventId===spectatorEvent))
 const forbiddenWorld=await outside.request('WORLD_CHAT_SEND',{text:'관전중 바깥 우회'});check('approved spectator cannot send outside scope',forbiddenWorld.type==='ERROR'&&forbiddenWorld.payload.code==='GAME_CHAT_REQUIRED')
 await outside.request('GAME_UNWATCH');await outside.request('TABLE_UNWATCH')
 await pause(2800)
 for(const [i,[x,y]]of [[7,7],[7,8],[8,7],[8,8],[6,7],[6,8]].entries()) {
  const state=await a2.request('GAME_STATE_CHECK',{gameId:result.humanGameId});check('human state '+i,state.type==='GAME_STATE')
  const actor=state.payload.publicState.turnUserId==='101'?a2:b
  const ack=await actor.request('GAME_ACTION_SEND',{gameId:result.humanGameId,actionId:'human-'+i,expectedVersion:state.payload.version,input:{x,y}})
  check('human move '+i,ack.type!=='ERROR')
 }
 const commentary=await until(()=>status(a2),s=>s.commentary?.some(c=>c.gameId===result.humanGameId&&c.version>=6),18000)
 check('human OMOK NPC commentary at six moves',commentary.commentary.some(c=>c.gameId===result.humanGameId&&c.version>=6));result.commentary=commentary.commentary
 check('real engine analysis for human game',commentary.engine!=='RAPFI'||commentary.commentary.some(c=>c.gameId===result.humanGameId&&c.source.startsWith('RAPFI')))
 const observingAt=performance.now(),trace=[];let keepAliveAt=observingAt+8000,extra=0,reached=false
 const spoken=()=>a2.events.filter(e=>e.type==='WORLD_AI_COMPANION_SPEECH'&&e.payload.gameId===result.humanGameId&&e.payload.basedOnVersion>=6)
 while(performance.now()-observingAt<90000){
  const world=await status(a2),watchers=world.actors.filter(n=>n.observingGameId===result.humanGameId)
  trace.push({ms:Math.round(performance.now()-observingAt),actors:world.actors.map(n=>({id:n.id,x:n.x,z:n.z,moving:n.moving,seated:n.seated,observingGameId:n.observingGameId}))})
  if(watchers.length>2)throw Error('More than two observers')
  if(watchers.length===2&&watchers.every(n=>!n.moving&&!n.seated&&Math.hypot(n.x-tablePoint[0],n.z-tablePoint[2])<5)&&new Set(spoken().map(e=>e.payload.actorId)).size===2){reached=true;break}
  if(performance.now()>=keepAliveAt){
   const state=await a2.request('GAME_STATE_CHECK',{gameId:result.humanGameId}),p=state.payload.publicState
   if(!p||p.status!=='PLAYING')throw Error('Observer game ended before arrival')
   const candidates=[[0,0],[14,14],[0,2],[14,12],[0,4],[14,10],[0,6],[14,8],[2,0],[12,14]],forbidden=p.forbiddenMoves??[]
   const point=candidates.find(([x,y])=>p.board[y][x]===0&&!(p.turnUserId===p.blackUserId&&forbidden.some(q=>q.x===x&&q.y===y)))
   if(!point)throw Error('No safe keepalive move')
   const actor=p.turnUserId==='101'?a2:b,ack=await actor.request('GAME_ACTION_SEND',{gameId:result.humanGameId,actionId:'keepalive-'+extra++,expectedVersion:state.payload.version,input:{x:point[0],y:point[1]}})
   if(ack.type==='ERROR')throw Error('Observer keepalive move rejected');keepAliveAt=performance.now()+8000
  }
  await pause(500)
 }
 result.observer={trace,reached,elapsedMs:performance.now()-observingAt,speech:spoken().map(e=>({actorId:e.payload.actorId,name:e.payload.name,text:e.payload.speech,basedOnVersion:e.payload.basedOnVersion}))}
 check('two physical observers walk to the human game and speak',reached)
 check('observer capacity is two throughout',trace.every(p=>p.actors.filter(n=>n.observingGameId===result.humanGameId).length<=2))
 check('one physical body per resident throughout',trace.every(p=>new Set(p.actors.map(n=>n.id)).size===3&&p.actors.length===3))
 check('different speakers do not share identical commentary',new Set(result.observer.speech.map(e=>e.name)).size===2&&new Set(result.observer.speech.map(e=>e.text)).size>=2)
 await http('/local/ai/companions/talk',a2.token,{persona:'guide',question:'안녕하세요'});check('fixed greeting without key',!!(await status(a2)).reply)
 result.final=await status(a2);result.pass=true
}catch(error){result.failure=error.message;result.pass=false;console.error(error.message);process.exitCode=1}
finally{clearInterval(heartbeat);for(const c of clients)c.close();if(server.exitCode===null){server.kill();await Promise.race([new Promise(r=>server.once('exit',r)),pause(8000)])}await log.close();await writeFile(path.join(output,'results.json'),JSON.stringify(result,null,2));console.log('Saved '+path.join(output,'results.json'))}
