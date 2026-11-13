// Loopback-only end-to-end fixture. Keys/webhooks are inherited, never command arguments or output.
import { spawn } from 'node:child_process'
import { readFile,mkdir,readdir,writeFile,open } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import net from 'node:net'
const repo=fileURLToPath(new URL('../',import.meta.url)),backend=path.join(repo,'backend')
const output=path.resolve(process.argv[2]??path.join(backend,'.gradle/ai-park-benchmark',`interventions-${Date.now()}`))
const options=process.argv.slice(3),live=options.includes('--live-jev'),liveMm=options.includes('--live-mm')
if(options.some(o=>!['--live-jev','--live-mm'].includes(o)))throw Error('Unknown option')
if(live&&!process.env.JEV_API_KEY)throw Error('JEV_API_KEY must be set in the launching shell')
if(liveMm&&!process.env.AI_LAB_MM_WEBHOOK)throw Error('AI_LAB_MM_WEBHOOK must be set in the launching shell')
await mkdir(output,{recursive:true});if((await readdir(output)).length)throw Error('Use a new empty result directory')
await new Promise((resolve,reject)=>{const p=net.createServer();p.once('error',reject);p.listen(19192,'127.0.0.1',()=>p.close(resolve))})
const pause=ms=>new Promise(r=>setTimeout(r,ms)),base='http://127.0.0.1:19192'
async function json(url,token,body){const r=await fetch(base+url,{method:body===undefined?'GET':'POST',
 headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},
 body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(6000)});if(!r.ok)throw Error(`HTTP ${r.status} ${url}`);return r.json()}
async function saved(){return JSON.parse(await readFile(path.join(output,'state/state.json'),'utf8'))}
async function until(read,predicate,limit=35000){const start=performance.now();let value;do{value=await read();if(predicate(value))return value;await pause(250)}while(performance.now()-start<limit);return value}
async function client(role){
 const grant=await json('/dev/alkkagi-park/session',null,{role}),{accessToken:token}=await json('/api/v1/auth/exchange',null,grant)
 const {ticket}=await json('/api/v1/auth/websocket-ticket',token,{})
 const ws=new WebSocket('ws://127.0.0.1:19192/ws/tables?ticket='+ticket),pending=new Map(),events=[]
 let seq=0,intentional=false
 const ready=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('CONNECTED timeout')),10000)
  ws.addEventListener('error',()=>{clearTimeout(timer);reject(Error('WebSocket connection error'))},{once:true})
  ws.addEventListener('close',e=>{if(!intentional)events.push({type:'CLOSED',code:e.code,at:Date.now()});for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('socket closed'))};pending.clear()})
  ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.type==='CONNECTED'){clearTimeout(timer);resolve(m.payload)}
   if(['WORLD_CHAT_MESSAGE','WORLD_CHAT_MODERATED','WORLD_AI_PRIVATE_NOTICE','WORLD_AI_POLICE'].includes(m.type))events.push({type:m.type,at:Date.now(),payload:m.payload})
   const p=pending.get(m.requestId);if(!p)return;pending.delete(m.requestId);clearTimeout(p.timer)
   if(m.type==='ERROR')p.reject(Error(m.payload.code));else p.resolve(m.payload)
  })
 })
 function request(type,payload={}){if(ws.readyState!==WebSocket.OPEN)return Promise.reject(Error('socket not open'))
  const requestId='i'+(++seq);return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(requestId);reject(Error('socket request timeout'))},6000)
   pending.set(requestId,{resolve,reject,timer});ws.send(JSON.stringify({requestId,type,payload}))})}
 function close(){intentional=true;for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('closed'))};pending.clear();ws.close()}
 try{const hello=await ready;await request('WORLD_MAP_CONFIRM',hello.map);await request('CHANNEL_JOIN',{channelId:'channel-1'});await request('WORLD_TIME_CHECK');await json('/local/ai/roof-position',token,{})}
 catch(error){close();throw error}
 return {token,events,request,close}
}
const cp=(await readFile(path.join(backend,'build/ai-lab/classpath.txt'),'utf8')).trim()
const log=await open(path.join(output,'server.log'),'w')
const server=spawn('java.exe',['-Xmx768m','-cp',cp,'com.ssafy.ontop.demo.AiParkApplication'],{cwd:backend,windowsHide:true,stdio:['ignore',log.fd,log.fd],
 env:{...process.env,AI_PARK_BENCHMARK:'on',AI_PARK_BENCHMARK_DIRECTORY:path.join(output,'state'),AI_PARK_BENCHMARK_LIVE_JEV:String(live),AI_PARK_BENCHMARK_LIVE_MM:String(liveMm)}})
const clients=[],results={at:new Date().toISOString(),liveJev:live,liveMattermost:liveMm,forcedBatchChecks:true,stages:[]}
let heartbeat
async function persist(){await writeFile(path.join(output,'results.json'),JSON.stringify(results,null,2))}
function arrivals(){return new Set(clients.flatMap(c=>c.events.filter(e=>e.type==='WORLD_AI_POLICE').map(e=>e.payload.incidentId)))}
try{
 let up=false;for(let i=0;i<100;i++){if(server.exitCode!==null)throw Error('Server exited');try{up=(await json('/actuator/health')).status==='UP'}catch{}if(up)break;await pause(300)}
 if(!up)throw Error('Server readiness timeout')
 for(const role of ['red','green','viewer'])clients.push(await client(role))
 for(const c of clients)await c.request('WORLD_TIME_CHECK')
 const status=await json('/local/ai/status',clients[0].token)
 if(!status.mode.startsWith('CHAT_FILTER_NEGATIVE / FEEDBACK_') || live&&!status.mode.includes('FEEDBACK_JEV') || liveMm&&!status.mode.endsWith('MATTERMOST'))throw Error('Wrong server mode')
 results.mode=status.mode;heartbeat=setInterval(()=>{for(const c of clients)c.request('WORLD_TIME_CHECK').catch(()=>{})},1000)
 const scenarios=[
  {name:'normal',rule:false,conflict:false,messages:[[0,'안녕하세요. 같이 산책해요.'],[1,'좋아요. 반가워요.']]},
  {name:'shared-mask',rule:true,conflict:false,messages:[[0,'씨발, 진짜 짜증 나네.'],[1,'차분하게 이야기해요.']]},
  {name:'repeat-shared-mask',rule:true,conflict:false,messages:[[0,'씨발 또 짜증 나네.']]},
  {name:'single-unmasked-negative',rule:false,conflict:true,messages:[[0,'아 ㅈ같네 진짜.']]},
  {name:'quoted-unmasked-report',rule:false,conflict:false,messages:[[0,"누가 'ㅈ같네'라고 했어요. 신고하고 싶어요."],[1,'저도 차분하게 이야기할게요.']]},
 ]
 for(const [index,scenario]of scenarios.entries()){
  if(index){console.log('Waiting 31s to isolate the recent conversation window');await pause(31000)}
  const before=await saved(),oldIncidents=new Set(before.incidents.map(i=>i.id)),ids=[]
  console.log('Scenario '+scenario.name)
  for(const [actor,text]of scenario.messages){const ack=await clients[actor].request('WORLD_CHAT_SEND',{text});ids.push(ack.messageId);await pause(1100)}
  await json('/local/ai/flush',clients[0].token,{})
  let data=await until(saved,s=>ids.every(id=>s.messages.some(m=>m.chat.id===id&&m.processed)))
  const newIncidents=data.incidents.filter(i=>!oldIncidents.has(i.id))
  const arrivedIds=()=>newIncidents.filter(i=>[...arrivals()].some(id=>id.startsWith(i.id+':'))).map(i=>i.id)
  if(newIncidents.length)await until(async()=>arrivedIds().length,count=>count===newIncidents.length,15000)
  data=await until(saved,s=>s.notices.filter(n=>newIncidents.some(i=>n.key==='case:'+i.id)).every(n=>n.status==='SENT'),15000)
  const assessments=Object.values(data.conflictAssessments??{}).filter(a=>a.pendingMessageIds.some(id=>ids.includes(id)))
  const rules=newIncidents.filter(i=>i.kind==='PROFANITY_RULE').length,conflicts=newIncidents.filter(i=>i.kind==='NEGATIVE_SPEECH').length
  const masks=clients.flatMap(c=>c.events).filter(e=>e.type==='WORLD_CHAT_MODERATED'&&ids.includes(e.payload.messageId)).length
  const notices=data.notices.filter(n=>newIncidents.some(i=>n.key==='case:'+i.id)).map(n=>({kind:n.kind,status:n.status,attempts:n.attempts}))
  const stage={name:scenario.name,expectRule:scenario.rule,expectConflict:scenario.conflict,ids,processed:ids.every(id=>data.messages.some(m=>m.chat.id===id&&m.processed)),
   rules,conflicts,masks,hidden:data.messages.filter(m=>ids.includes(m.chat.id)&&m.hidden).length,assessments,notices,npcArrivals:arrivedIds().length,arrivedIncidentIds:arrivedIds(),
   pass:(rules>0)===scenario.rule&&(conflicts>0)===scenario.conflict&&masks===0&&ids.every(id=>data.messages.some(m=>m.chat.id===id&&m.processed&&!m.hidden))
    &&notices.every(n=>n.status==='SENT')&&(!newIncidents.length||notices.length>0&&arrivedIds().length===newIncidents.length)}
  results.stages.push(stage);await persist();console.log(JSON.stringify(stage))
 }
 console.log('Checking existing feedback flow')
 const reportsBefore=(await saved()).reports.length
 await json('/local/ai/feedback-position',clients[0].token,{})
 await json('/api/v1/feedback',clients[0].token,{operationId:'intervention-'+Date.now(),channelId:'channel-1',text:'전체 접속 불가입니다. 로그인을 할 수 없어요.'})
 await json('/local/ai/flush',clients[0].token,{})
 const final=await until(saved,s=>s.reports.length>reportsBefore&&s.reports.at(-1).triage&&s.notices.some(n=>n.kind==='URGENT_FEEDBACK'&&n.status==='SENT'))
 results.feedback={reports:final.reports.length,triage:final.reports.at(-1)?.triage,urgentSent:final.notices.some(n=>n.kind==='URGENT_FEEDBACK'&&n.status==='SENT')}
 results.finalStatus=await json('/local/ai/status',clients[0].token)
 results.pass=results.stages.every(s=>s.pass)&&!!results.feedback.urgentSent
 await persist();console.log('Saved '+path.join(output,'results.json'))
}catch(error){results.failure=error.message;results.pass=false;await persist();throw error}
finally{clearInterval(heartbeat);for(const c of clients)c.close();if(server.exitCode===null){server.kill();await Promise.race([new Promise(r=>server.once('exit',r)),pause(10000)])};await log.close()}
