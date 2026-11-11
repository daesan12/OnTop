// Bounded loopback-only comparison. Build first: backend/gradlew.bat aiLabClasspath.
// node scripts/measure-ai-park.mjs [new-output-directory] [ground|roof] [--live-jev]
import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, readdir, mkdir, writeFile, open } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import net from 'node:net'
import os from 'node:os'
import { classifyUnhidden,transportValidity } from './ai-measurement-status.mjs'
import { moderationCase,thresholdCase } from './ai-moderation-cases.mjs'
const exec = promisify(execFile)
const repo = fileURLToPath(new URL('../', import.meta.url))
const backend = path.join(repo, 'backend')
const output = path.resolve(process.argv[2] ?? path.join(backend, '.gradle/ai-park-benchmark', String(Date.now())))
const scenario = process.argv[3] ?? 'ground'
const options=process.argv.slice(4)
if(options.some(option => !['--live-jev','--policy-cases','--threshold-cases'].includes(option))) throw new Error('Unknown benchmark option')
const liveJev=options.includes('--live-jev')
const thresholdCases=options.includes('--threshold-cases')
const policyCases=options.includes('--policy-cases') || thresholdCases
if(liveJev && !process.env.JEV_API_KEY) throw new Error('Live Jev requires JEV_API_KEY in the launching shell; never put it in command arguments')
if (!['ground', 'roof'].includes(scenario)) throw new Error('Scenario must be ground or roof')
const base = 'http://127.0.0.1:19192'
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const cp = (await readFile(path.join(backend, 'build/ai-lab/classpath.txt'), 'utf8')).trim()
await mkdir(output, { recursive: true })
if ((await readdir(output)).length) throw new Error('Output directory must be empty; previous results are preserved')
// Refuse occupied ports; never stop an existing server.
await new Promise((resolve, reject) => {
  const probe = net.createServer(); probe.once('error', reject)
  probe.listen(19192, '127.0.0.1', () => probe.close(resolve))
})
async function json(url, token, body) {
  const response = await fetch(base + url, { method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(5000) })
  if (!response.ok) throw new Error(`HTTP ${response.status} ${url}`)
  return response.json()
}
async function processStats(pid) {
  const { stdout } = await exec('powershell.exe', ['-NoProfile', '-Command',
    `$p=Get-Process -Id ${pid}; $cpu=$p.TotalProcessorTime.TotalSeconds; $at=[Diagnostics.Stopwatch]::GetTimestamp(); @{cpu=$cpu;at=$at;frequency=[Diagnostics.Stopwatch]::Frequency;rss=$p.WorkingSet64;peak=$p.PeakWorkingSet64}|ConvertTo-Json -Compress`], { windowsHide: true })
  return JSON.parse(stdout)
}
function summary(values) {
  const a = [...values].sort((a, b) => a - b)
  return { n: a.length, p50: a[Math.floor((a.length - 1) * .5)] ?? null,
    p95: a[Math.floor((a.length - 1) * .95)] ?? null, max: a.at(-1) ?? null }
}
async function connect(role) {
  const code = await json('/dev/alkkagi-park/session', null, { role })
  const { accessToken: token } = await json('/api/v1/auth/exchange', null, code)
  const { ticket } = await json('/api/v1/auth/websocket-ticket', token, {})
  const ws = new WebSocket('ws://127.0.0.1:19192/ws/tables?ticket=' + ticket)
  const pending = new Map(); let serial = 0, measuring = false,intentionalClose=false
  const ownChats=new Map()
  const stats = { rtt: [], chat: [], move: [], errors: [], npcBytes: 0, npcMessages: 0,
    worldGaps: [], npcActions: {}, sent: 0, received: 0, timeouts: 0,closedRequests:0,disconnects:[] }
  ws.addEventListener('close', event => {
    if(!intentionalClose) stats.disconnects.push({code:event.code,clean:event.wasClean,at:Date.now()})
    for(const p of pending.values()) {clearTimeout(p.timer);p.reject(new Error('socket closed'))}
    pending.clear()
  })
  let lastWorld = 0
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('CONNECTED timeout')), 10000)
    ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('WebSocket connection failed')) }, { once: true })
    ws.addEventListener('message', event => {
      const m = JSON.parse(event.data), now = performance.now()
      if (m.type === 'CONNECTED') { clearTimeout(timer); resolve(m.payload) }
      if(m.type==='WORLD_CHAT_MODERATED') {
        const chat=ownChats.get(m.payload.messageId)
        if(chat && chat.hiddenAfterMs===null) chat.hiddenAfterMs=now-chat.started
      }
      if (measuring) {
        stats.received++
        if (m.type === 'WORLD_AI_NPCS') {
          stats.npcBytes += Buffer.byteLength(event.data); stats.npcMessages++
          for (const npc of m.payload.npcs ?? []) stats.npcActions[npc.action] = (stats.npcActions[npc.action] ?? 0) + 1
        }
        if (m.type === 'WORLD_STATE' && m.requestId === null) {
          if (lastWorld) stats.worldGaps.push(now - lastWorld)
          lastWorld = now
        }
      }
      const request = pending.get(m.requestId)
      if (!request) return
      pending.delete(m.requestId); clearTimeout(request.timer)
      if (m.type === 'ERROR') {
        if (request.measured) stats.errors.push(m.payload.code)
        request.reject(new Error(m.payload.code)); return
      }
      if(request.kind==='chat') ownChats.set(m.payload.messageId,
        {messageId:m.payload.messageId,started:request.start,expectedHidden:request.bad,hiddenAfterMs:null,
          caseId:request.caseId,category:request.category})
      if (request.measured) stats[request.kind]?.push(now - request.start)
      request.resolve(m.payload)
    })
  })
  function request(type, payload, kind, testCase) {
    const requestId = `b${++serial}`
    if (measuring) stats.sent++
    if(ws.readyState!==WebSocket.OPEN) {stats.closedRequests++;return Promise.reject(new Error('socket not open'))}
    return new Promise((resolve, reject) => {
      const measured = measuring
      const timer = setTimeout(() => { pending.delete(requestId); if (measured) stats.timeouts++; reject(new Error('request timeout')) }, 5000)
      pending.set(requestId, { start: performance.now(), timer, resolve, reject, kind, measured,
        bad:kind==='chat' && (testCase?.expectedHidden ?? payload.text.startsWith('씨발')),
        caseId:testCase?.id,category:testCase?.category })
      ws.send(JSON.stringify({ requestId, type, payload }))
    })
  }
  try {
    const hello = await ready
    await request('WORLD_MAP_CONFIRM', hello.map)
    await request('CHANNEL_JOIN', { channelId: 'channel-1' })
    if (scenario === 'roof') await json('/local/ai/roof-position', token, {})
  } catch (error) {
    for (const p of pending.values()) { clearTimeout(p.timer); p.reject(error) }
    pending.clear(); ws.close(); throw error
  }
  return { token, request, stats, ownChats, begin() { measuring = true; lastWorld = 0 }, end() { measuring = false },
    close() { intentionalClose=true;for (const p of pending.values()) { clearTimeout(p.timer); p.reject(new Error('closed')) }; pending.clear(); ws.close() } }
}
const results = []
const rounds=['off','on','on','off'].map((mode,index) => ({mode,index,attempt:0}))
for (const {index,mode,attempt} of rounds) {
  const holdout=thresholdCases && index>=2
  const caseSet=holdout?'threshold-holdout':policyCases?'core-policy':'original-load'
  const runDir = path.join(output, `${index + 1}-${mode}${attempt?'-retry':''}`)
  await mkdir(runDir, { recursive: true })
  const log = await open(path.join(runDir, 'server.log'), 'w')
  const server = spawn('java.exe', ['-Xmx768m', '-cp', cp, 'com.ssafy.ontop.demo.AiParkApplication'], {
    cwd: backend, windowsHide: true, stdio: ['ignore', log.fd, log.fd],
    env: { ...process.env, AI_PARK_BENCHMARK: mode, AI_PARK_BENCHMARK_DIRECTORY: path.join(runDir, 'state'),
      AI_PARK_BENCHMARK_LIVE_JEV:String(liveJev), AI_LAB_JEV_LIVE: 'false', AI_LAB_MM_LIVE: 'false' } })
  const clients = []; const timers = []; const inFlight = new Set(); const backlogSamples=[]
  try {
    let healthy = false
    for (let attempt = 0; attempt < 100; attempt++) {
      if (server.exitCode !== null) throw new Error('Benchmark server exited')
      try { healthy = (await json('/actuator/health')).status === 'UP' } catch { }
      if (healthy) break
      await pause(300)
    }
    if (!healthy) throw new Error('Server readiness timeout')
    for (const role of ['red', 'green', 'viewer']) clients.push(await connect(role))
    const initial=await json('/local/ai/status',clients[0].token)
    const expectedMode='CHAT_FILTER_NEGATIVE / FEEDBACK_'+(liveJev?'JEV / LOCAL':'OFFLINE_RULE_FIXTURE / LOCAL')
    if(initial.mode!==expectedMode) throw new Error('Benchmark provider mode mismatch; input was not started')
    let polling=false
    const poll=async () => {
      if(polling) return
      polling=true
      try {
        const state=await json('/local/ai/status',clients[0].token)
        backlogSamples.push({at:Date.now(),ingress:state.queue,pending:state.worker.pending,
          oldestPendingAgeMs:state.worker.oldestPendingAgeMs,error:state.worker.lastError})
      } finally { polling=false }
    }
    timers.push(setInterval(() => track(poll()),1000))
    let seq = 0, chatNo = 0
    const track = p => { inFlight.add(p); p.catch(() => {}).finally(() => inFlight.delete(p)) }
    timers.push(setInterval(() => { for (const c of clients) track(c.request('WORLD_TIME_CHECK', {}, 'rtt')) }, 200))
    timers.push(setInterval(() => { seq++; for (const c of clients) track(c.request('WORLD_MOVE', { seq, dx: 0, dz: 0, run: false, jump: false }, 'move')) }, 100))
    timers.push(setInterval(() => { chatNo++; for (const [i, c] of clients.entries()) {
      const testCase=policyCases?(holdout?thresholdCase(chatNo,i):moderationCase(chatNo,i)):undefined
      track(c.request('WORLD_CHAT_SEND', { text:testCase?.text ?? (chatNo % 5 === 0 && i < 2 ? '씨발 테스트 ' + chatNo : '안녕하세요 측정 ' + chatNo) }, 'chat',testCase))
    } }, 2000))
    console.log(`run ${index + 1} attempt ${attempt+1} NPC ${mode} [${caseSet}]: 15s warmup`)
    await pause(15000)
    const before = await processStats(server.pid), start = performance.now()
    for (const c of clients) c.begin()
    console.log(`run ${index + 1}: 30s sample`)
    await pause(30000)
    for (const timer of timers) clearInterval(timer)
    await Promise.allSettled([...inFlight])
    const elapsed = (performance.now() - start) / 1000
    for (const c of clients) c.end()
    const after = await processStats(server.pid)
    const state = await json('/local/ai/status', clients[0].token)
    // The ingress queue alone does not reveal the separate moderation backlog.
    const saved = JSON.parse(await readFile(path.join(runDir, 'state/state.json'), 'utf8'))
    const pendingMessages = saved.messages.filter(message => !message.processed)
    const aiBacklog = { capturedAt: Date.now(), total: saved.messages.length,
      pending: pendingMessages.length, oldestPendingAgeMs: pendingMessages.length
        ? Date.now() - Math.min(...pendingMessages.map(message => message.chat.sentAt)) : 0 }
    // Stop input at the same 45s boundary; retain sockets to observe the final partial batch.
    const drainStarted=performance.now()
    let drained=state
    while((drained.queue>0 || drained.worker.pending>0) && performance.now()-drainStarted<15_000) {
      await pause(250)
      drained=await json('/local/ai/status',clients[0].token)
    }
    await pause(300)
    const own=clients.flatMap(c => [...c.ownChats.values()])
    const expected=own.filter(c => c.expectedHidden), normal=own.filter(c => !c.expectedHidden)
    const completed=JSON.parse(await readFile(path.join(runDir,'state/state.json'),'utf8'))
    const rows=new Map(completed.messages.map(message => [message.chat.id,message]))
    const decisions=completed.assessments ?? {}
    const unhidden=expected.filter(chat => chat.hiddenAfterMs===null)
    const moderation={chatAction:'ADVISORY_ONLY',maskExpectationsApplicable:false,allChats:own.length,expectedHidden:expected.length,
      hidden:expected.filter(c => c.hiddenAfterMs!==null).length,
      missed:expected.filter(c => c.hiddenAfterMs===null).length,
      unhiddenAtEnd:unhidden.length,
      ...classifyUnhidden(unhidden,rows),
      normalChats:normal.length,normalHidden:normal.filter(c => c.hiddenAfterMs!==null).length,
      normalReviewed:normal.filter(c => rows.get(c.messageId)?.processed===true).length,
      scoredChats:own.filter(c => decisions[c.messageId]!=null).length,
      hideLatencyMs:summary(expected.flatMap(c => c.hiddenAfterMs===null?[]:[c.hiddenAfterMs])),
      hideSamplesMs:expected.flatMap(c => c.hiddenAfterMs===null?[]:[c.hiddenAfterMs]),
      remainingAfterDrain:drained.worker.pending,ingressAfterDrain:drained.queue,
      drainMs:performance.now()-drainStarted,backlogSamples,
      finalProviderMode:drained.mode,finalProviderUsage:drained.providerUsage,
      finalWorkerError:drained.worker.lastError,finalAiError:drained.error,
      cases:own.map(c => ({messageId:c.messageId,caseId:c.caseId,category:c.category,expectedHidden:c.expectedHidden,
        hiddenAfterMs:c.hiddenAfterMs,processed:rows.get(c.messageId)?.processed ?? false,
        hidden:rows.get(c.messageId)?.hidden ?? false,assessment:decisions[c.messageId] ?? null}))}
    const merged = key => clients.flatMap(c => c.stats[key])
    const cpuElapsed = (after.at - before.at) / before.frequency
    const transport=transportValidity(clients.map(c => c.stats),own.length)
    const result = { run: index + 1,attempt, npc: mode, scenario,caseSet,transport, elapsed, cpuElapsed,
      cpuCorePercent: (after.cpu - before.cpu) / cpuElapsed * 100,
      rssMiB: after.rss / 1048576, peakRssMiB: after.peak / 1048576,
      rttMs: summary(merged('rtt')), chatMs: summary(merged('chat')), moveMs: summary(merged('move')),
      worldGapMs: summary(merged('worldGaps')), errors: merged('errors'),
      timeouts: clients.reduce((s, c) => s + c.stats.timeouts, 0),
      npcBytesPerSecondPerClient: clients.reduce((s, c) => s + c.stats.npcBytes, 0) / elapsed / 3,
      npcActions: clients.map(c => c.stats.npcActions), aiError: state.error, aiWorker: state.worker,
      aiQueue: state.queue, aiRejected: state.rejected, aiBacklog,
      moderation,
      samples: clients.map(c => c.stats) }
    results.push(result)
    await writeFile(path.join(runDir, 'result.json'), JSON.stringify(result, null, 2))
    console.log(JSON.stringify({ ...result, samples: undefined,moderation:{...moderation,backlogSamples:undefined,hideSamplesMs:undefined,cases:undefined} }))
    // One bounded retry only for an empty transport failure with zero provider calls.
    // Never rerun model disagreements to select a favorable result.
    if(!transport.valid && own.length===0 && (drained.providerUsage.calls??0)===0 && attempt===0) {
      rounds.push({index,mode,attempt:1})
      console.log(`run ${index+1} excluded: empty transport failure; one retry scheduled after planned rounds`)
    }
  } finally {
    for (const timer of timers) clearInterval(timer)
    for (const c of clients) c.close()
    if (server.exitCode === null) { server.kill(); await Promise.race([new Promise(resolve => server.once('exit', resolve)), pause(10000)]) }
    await log.close()
  }
}
await writeFile(path.join(output, 'results.json'), JSON.stringify({ at: new Date().toISOString(),
  environment: { platform: os.platform(), cpu: os.cpus()[0].model, logicalCpus: os.cpus().length, node: process.version,
    users: 3, moveHzPerUser: 10, timeCheckHzPerUser: 5, chatSecondsPerUser: 2, warmupSeconds: 15, sampleSeconds: 30,
    drainLimitSeconds:15,statusPollHz:1,hideLatencyBoundary:'Own chat request send to WORLD_CHAT_MODERATED receive; entire 45s input including warmup plus tail drain',
    scenario,policyCases,thresholdCases, apiMode:'CHAT_FILTER_NEGATIVE / FEEDBACK_'+(liveJev?'JEV / LOCAL':'OFFLINE_RULE_FIXTURE / LOCAL'), order: ['off', 'on', 'on', 'off'], fps: 'not measured' }, results }, null, 2))
console.log('Saved ' + path.join(output, 'results.json'))
