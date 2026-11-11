// Isolated functional test: no paid providers, shared DB, live server restart, or load generation.
import {spawn} from 'node:child_process'
import {readFile,mkdir,readdir,writeFile,open} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import net from 'node:net'
const repo=fileURLToPath(new URL('../',import.meta.url)),backend=path.join(repo,'backend')
const output=path.resolve(process.argv[2]??path.join(backend,'.gradle/ai-park-benchmark','police-return-'+Date.now()))
if(process.argv[3]&&process.argv[3]!=='--preview')throw Error('Unknown option')
await mkdir(output,{recursive:true});if((await readdir(output)).length)throw Error('Use an empty output directory')
await new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(19192,'127.0.0.1',()=>server.close(resolve))})
const base='http://127.0.0.1:19192',pause=ms=>new Promise(r=>setTimeout(r,ms))
async function json(url,token,body){const r=await fetch(base+url,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error('HTTP '+r.status+' '+url);return r.json()}
async function until(read,test,timeout=30000){const begin=Date.now();while(Date.now()-begin<timeout){const value=await read();if(test(value))return value;await pause(100)}throw Error('Timed out waiting for police return')}
const env={...process.env,AI_PARK_BENCHMARK:'on',AI_PARK_BENCHMARK_DIRECTORY:path.join(output,'state'),AI_PARK_BENCHMARK_LIVE_JEV:'false',AI_PARK_BENCHMARK_LIVE_MM:'false'}
delete env.JEV_API_KEY;delete env.OPENAI_API_KEY;delete env.AI_LAB_MM_WEBHOOK
const cp=(await readFile(path.join(backend,'build/ai-lab/classpath.txt'),'utf8')).trim(),log=await open(path.join(output,'server.log'),'w')
const server=spawn('java.exe',['-Xmx768m','-cp',cp,'com.ssafy.ontop.demo.AiParkApplication'],{cwd:backend,env,windowsHide:true,stdio:['ignore',log.fd,log.fd]})
let ws,heartbeat;const pending=new Map(),trace=[],ambient=new Map(),speechEvents=[],result={at:new Date().toISOString(),externalProviders:false,stages:[]};let serial=0
try{
 await until(async()=>{if(server.exitCode!==null)throw Error('server exited');try{return await json('/actuator/health')}catch{return null}},s=>s?.status==='UP')
 const grant=await json('/dev/alkkagi-park/session',null,{role:'red'}),{accessToken:token}=await json('/api/v1/auth/exchange',null,grant),{ticket}=await json('/api/v1/auth/websocket-ticket',token,{})
 ws=new WebSocket('ws://127.0.0.1:19192/ws/tables?ticket='+ticket)
 const ready=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('CONNECTED timeout')),8000);ws.addEventListener('error',reject,{once:true});ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.type==='CONNECTED'){clearTimeout(timer);resolve(m.payload)}if(m.type==='WORLD_AI_NPCS')for(const n of m.payload.npcs)trace.push({at:Date.now(),...n});if(m.type==='WORLD_AI_NPCS'||m.type==='WORLD_AI_COMPANIONS')for(const n of m.payload.npcs??m.payload.actors)if(n.ambient)ambient.set(n.id,{actor:n.id,name:n.name,action:n.action,...n.ambient});if(['WORLD_CHAT_MESSAGE','WORLD_AI_POLICE','WORLD_AI_COMPANION_SPEECH'].includes(m.type))speechEvents.push(m);const p=pending.get(m.requestId);if(p){clearTimeout(p.timer);pending.delete(m.requestId);if(m.type==='ERROR')p.reject(Error(m.payload.code));else p.resolve(m.payload)}})})
 const request=(type,payload={})=>new Promise((resolve,reject)=>{const requestId='return-'+(++serial),timer=setTimeout(()=>{pending.delete(requestId);reject(Error('socket request timeout'))},8000);pending.set(requestId,{resolve,reject,timer});ws.send(JSON.stringify({type,requestId,payload}))})
 const hello=await ready;await request('WORLD_MAP_CONFIRM',hello.map);await request('CHANNEL_JOIN',{channelId:'channel-1'});await request('WORLD_TIME_CHECK')
 heartbeat=setInterval(()=>{void request('WORLD_TIME_CHECK').catch(()=>{})},1000)
 await until(async()=>trace.at(-1),Boolean)
 await until(async()=>ambient.size,n=>n>=4)
 result.ambient={bubbles:[...ambient.values()],chatOrSpeechEvents:speechEvents.length,pass:ambient.size===4&&speechEvents.length===0}
 console.log(JSON.stringify({ambient:result.ambient}))
 if(process.argv[3]==='--preview')await pause(30000)
 for(const location of ['roof-position','jumpmap-position']){
  await json('/local/ai/'+location,token,{});await request('WORLD_TIME_CHECK');const before=trace.at(-1),begin=trace.length
  await request('WORLD_CHAT_SEND',{text:'씨발'});await json('/local/ai/flush',token,{})
  await until(async()=>trace.slice(begin),t=>t.some(n=>n.action==='TELEPORT_WARNING'))
  await until(async()=>trace.slice(begin),t=>{const first=t.findIndex(n=>n.action==='TELEPORT_WARNING');return first>=0&&t.slice(first+1).some(n=>n.action==='RETURN'||n.action==='RETURN_JUMP')})
  await until(async()=>trace.slice(begin),t=>{const returning=t.findIndex(n=>n.action==='RETURN'||n.action==='RETURN_JUMP');return returning>=0&&t.slice(returning+1).some(n=>n.action==='PATROL'||n.action==='REST')})
  const frames=trace.slice(begin),warning=frames.find(n=>n.action==='TELEPORT_WARNING'),returned=frames.findLast(n=>n.action==='PATROL'||n.action==='REST')
  const stage={location,frames,pass:frames.every(n=>n.warp<=before.warp+1)&&warning.warp===before.warp+1&&returned.warp===warning.warp&&returned.y<warning.y-1}
  result.stages.push(stage);console.log(JSON.stringify({location,pass:stage.pass,frames:frames.length,warningY:warning.y,returnedY:returned.y,warp:returned.warp}))
 }
 result.pass=result.ambient.pass&&result.stages.every(s=>s.pass)
 if(!result.pass)throw Error('Police return checks failed')
}catch(error){result.pass=false;result.error=error.message;throw error}
finally{
 clearInterval(heartbeat);for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('test closed'))}pending.clear();ws?.close()
 await writeFile(path.join(output,'results.json'),JSON.stringify(result,null,2));server.kill();await new Promise(r=>server.exitCode!==null?r():server.once('exit',r));await log.close()
}
