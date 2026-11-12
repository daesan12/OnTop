// Real loopback sockets + table-scoped opponents. All external providers explicitly disabled.
import {spawn,execFileSync} from 'node:child_process'
import {readFile,writeFile,mkdir,open} from 'node:fs/promises'
import {fileURLToPath,pathToFileURL} from 'node:url'
import path from 'node:path'
import net from 'node:net'
const repo=fileURLToPath(new URL('../',import.meta.url)),backend=path.join(repo,'backend')
const output=path.resolve(process.argv[2]??path.join(backend,'.gradle/ai-park-benchmark','table-opponents-'+Date.now()))
await mkdir(path.dirname(output),{recursive:true})
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
// Manifest URLs are ASCII even in a Korean workspace; avoid Windows command/arg-file encoding limits.
const classpathJar=path.join(output,'classpath.jar'),manifest=path.join(output,'classpath.mf')
const urls=cp.split(path.delimiter).map(p=>pathToFileURL(p+(p.endsWith('.jar')?'':path.sep)).href).join(' ')
const line='Class-Path: '+urls
await writeFile(manifest,'Manifest-Version: 1.0\r\n'+line.match(/.{1,70}/g).join('\r\n ')+'\r\n\r\n')
execFileSync('jar.exe',['--create','--file',classpathJar,'--manifest',manifest],{windowsHide:true})
const server=spawn('java.exe',['-Xmx768m','-cp',classpathJar,'com.ssafy.ontop.demo.AiParkApplication'],{cwd:backend,windowsHide:true,stdio:['ignore',log.fd,log.fd],env})
const clients=[];let heartbeat,result={at:new Date().toISOString(),externalProviders:false,checks}
const status=c=>http('/local/ai/companions/status',c.token)
async function place(c,index=0){const p=await http('/local/ai/table-position?index='+index,c.token,{});await c.request('WORLD_TIME_CHECK');const joined=await c.request('TABLE_JOIN',{tableId:p.tableId});check('real TABLE_JOIN '+index,joined.type==='TABLE_STATE');return p.tableId}
try{
 await until(async()=>{if(server.exitCode!==null)throw Error('server exited');try{return await http('/actuator/health')}catch{return null}},v=>v?.status==='UP',45000)
 const a=await connect('red'),b=await connect('green');clients.push(a,b)
 heartbeat=setInterval(()=>{for(const c of clients)c.request('WORLD_TIME_CHECK').catch(()=>{})},1000)
 for(const [i,c] of clients.entries()){await place(c,i);const r=await c.request('GAME_SELECT',{gameCode:'OMOK',betAmountPerPlayer:0});check('select omok '+i,r.type==='TABLE_STATE')}
 const one=await http('/local/ai/companions/invite',a.token,{difficulty:'HARD'}),two=await http('/local/ai/companions/invite',b.token,{difficulty:'HARD'})
 check('same difficulty uses independent actors',one.actorId!==two.actorId&&one.npcUserId!==two.npcUserId&&one.snapshot.gameId!==two.snapshot.gameId)
 check('both begin with a short entrance',one.phase==='ARRIVING'&&two.phase==='ARRIVING')
 const early=await until(()=>status(a),s=>s.actors.some(n=>n.id===one.actorId))
 const initialActor=early.actors.find(n=>n.id===one.actorId)
 check('temporary actor appears moving beside table',initialActor.moving&&!initialActor.seated&&initialActor.role==='OPPONENT')
 const first=await until(()=>status(a),s=>s.practice?.phase==='PLAYING',8000),second=await until(()=>status(b),s=>s.practice?.phase==='PLAYING',8000)
 const seated=first.actors.find(n=>n.id===one.actorId)
 check('short walk reaches seat',seated?.seated&&!seated.moving&&initialActor.x-seated.x>1)
 check('three roaming commentators remain separate',first.actors.filter(n=>n.role!=='OPPONENT').length===3&&first.actors.filter(n=>n.role==='OPPONENT').length===2)
 result.entrance={initialActor,seated};result.games=[one.snapshot.gameId,two.snapshot.gameId]
 await http('/local/ai/companions/action',a.token,{kind:'place',gameId:one.snapshot.gameId,version:first.practice.snapshot.version,actionId:'table-opponents-first',x:7,y:7})
 await until(()=>status(a),s=>s.practice?.snapshot.board.moveCount>=2)
 check('another table board stays untouched',(await status(b)).practice.snapshot.board.moveCount===0)
 await http('/local/ai/companions/action',a.token,{kind:'stop',gameId:one.snapshot.gameId})
 await until(()=>status(b),s=>!s.actors.some(n=>n.id===one.actorId))
 check('release one opponent leaves the other',(await status(b)).practice.snapshot.gameId===two.snapshot.gameId)
 await http('/local/ai/companions/action',b.token,{kind:'forfeit',gameId:two.snapshot.gameId,version:second.practice.snapshot.version})
 await until(()=>status(b),s=>!s.actors.some(n=>n.id===two.actorId))
 check('finished opponent disappears',(await status(b)).practice.snapshot.endedAt!==null)
 await http('/local/ai/companions/action',b.token,{kind:'stop',gameId:two.snapshot.gameId})
 for(const [i,c] of clients.entries()){await c.request('TABLE_LEAVE');await place(c,i);await c.request('GAME_SELECT',{gameCode:'OMOK',betAmountPerPlayer:0})}
 const automatic=await until(async()=>Promise.all(clients.map(c=>status(c))),s=>s.every(v=>v.practice?.phase==='PLAYING'),42000)
 check('two tables automatically invite normal opponents after thirty seconds',automatic.every(s=>s.practice.difficulty==='NORMAL')&&automatic[0].practice.actorId!==automatic[1].practice.actorId)
 result.pass=true
}catch(error){result.failure=error.message;result.pass=false;console.error(error.message);process.exitCode=1}
finally{clearInterval(heartbeat);for(const c of clients)c.close();if(server.exitCode===null){server.kill();await Promise.race([new Promise(r=>server.once('exit',r)),pause(8000)])}await log.close();await writeFile(path.join(output,'results.json'),JSON.stringify(result,null,2));console.log('Saved '+path.join(output,'results.json'))}
