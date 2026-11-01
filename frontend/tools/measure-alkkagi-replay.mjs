import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// 실제 Java 측정 궤적을 재사용한다. 네트워크/실제 GPU 성능 측정으로 표현하지 않는다.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const folder = path.join(root, 'backend/build/alkkagi/model-study')
// Node24의 타입 제거로 실제 TS 클래스를 그대로 실행한다. 측정용 재구현을 만들지 않는다.
const { AlkkagiReplay } = await import(pathToFileURL(path.join(root, 'frontend/src/game/alkkagi/replay.ts')).href)
const traces = JSON.parse(fs.readFileSync(path.join(folder, 'traces.json'), 'utf8'))
const rows = []
const snapshot = (frame, seq) => ({ gameId: 'replay-study', version: 1, simulationId: 1,
  stage: 'SIMULATING', tick: seq, serverNow: frame.time * 1000,
  pieces: frame.pieces.map((p, i) => ({ id: `p${i}`, owner: 0, type: '兵', radius: .24, mass: .8, ...p })) })
function truth(frames, seconds) {
  const index = Math.max(0, Math.min(frames.length - 1, seconds * 120))
  const a = frames[Math.floor(index)], b = frames[Math.min(frames.length - 1, Math.ceil(index))]
  const t = index - Math.floor(index)
  return a.pieces.map((p, i) => ({ ...p, x: p.x + (b.pieces[i].x - p.x) * t, y: p.y + (b.pieces[i].y - p.y) * t }))
}
for (const trace of traces.filter(t => t.scenario.startsWith('board32-'))) {
  for (const [hz, delay] of [[20, 100], [40, 100], [20, 150]]) for (const jitter of [false, true]) {
    const every = 120 / hz, packets = []
    let lastArrival = -1
    trace.frames.forEach((f, i) => {
      if (i % every) return
      const variation = jitter ? [-12, 15, -5, 9, -8, 0][packets.length % 6] : 0
      const arrival = Math.max(lastArrival + .01, f.time * 1000 + 30 + variation)
      packets.push({ arrival, state: snapshot(f, i), seq: packets.length + 1 }); lastArrival = arrival
    })
    const replay = new AlkkagiReplay(delay)
    let cursor = 0, sum = 0, count = 0, maxError = 0, maxRenderSpeed = 0, previous, firstVisibleMotion
    let freezeFrames = 0, animationTransitions = 0
    const firstMotionByPiece = new Map()
    const physicalMotion = trace.frames.find(f => f.pieces.some((p, i) => Math.hypot(p.x - trace.frames[0].pieces[i].x, p.y - trace.frames[0].pieces[i].y) > .001))?.time ?? 0
    for (let now = 0; now <= trace.frames.at(-1).time * 1000 + delay + 100; now += 1000 / 60) {
      while (cursor < packets.length && packets[cursor].arrival <= now) {
        const p = packets[cursor++]; replay.push(p.seq, p.state, p.arrival)
      }
      const frame = replay.sample(now); if (!frame) continue
      const expected = truth(trace.frames, (now - delay - 30) / 1000)
      let moved = false
      for (let i = 0; i < 32; i++) {
        const p = frame.pieces[i], actual = expected[i]
        if (p.alive && actual.alive) {
          const error = Math.hypot(p.x - actual.x, p.y - actual.y)
          maxError = Math.max(maxError, error); sum += error * error; count++
        }
        if (previous?.pieces[i].alive !== undefined && previous.pieces[i].alive !== p.alive) animationTransitions++
        if (previous?.pieces[i].alive && p.alive) {
          const distance = Math.hypot(p.x - previous.pieces[i].x, p.y - previous.pieces[i].y)
          maxRenderSpeed = Math.max(maxRenderSpeed, distance * 60); if (distance > .0001) moved = true
        }
        if (firstVisibleMotion === undefined && Math.hypot(p.x - trace.frames[0].pieces[i].x, p.y - trace.frames[0].pieces[i].y) > .001) firstVisibleMotion = now
        if (!firstMotionByPiece.has(i) && Math.hypot(p.x - trace.frames[0].pieces[i].x, p.y - trace.frames[0].pieces[i].y) > .001) firstMotionByPiece.set(i, now)
      }
      if (firstVisibleMotion !== undefined && !moved && expected.some(p => Math.hypot(p.vx, p.vy) > .1)) freezeFrames++
      previous = frame
    }
    const bytes = packets.reduce((sum, p) => sum + Buffer.byteLength(JSON.stringify({ type: 'STATE', seq: p.seq, state: p.state })), 0)
    rows.push({ model: trace.model, scenario: trace.scenario, hz, delayMs: delay,
      arrival: jitter ? 'synthetic -12..15ms jitter, FIFO' : 'synthetic constant30ms',
      positionRmse: Math.sqrt(sum / Math.max(1, count)), maxPositionError: maxError,
      maxRenderSpeed, firstMotionDelayMs: (firstVisibleMotion ?? 0) - physicalMotion * 1000,
      freezeFrames, animationTransitions, pieceMotionDelaysMs: [...firstMotionByPiece].map(([i, now]) => {
        const actual = trace.frames.find(f => Math.hypot(f.pieces[i].x - trace.frames[0].pieces[i].x, f.pieces[i].y - trace.frames[0].pieces[i].y) > .001)
        return { piece: i, delayMs: now - actual.time * 1000 }
      }), packets: packets.length,
      serializedFixtureBytes: bytes, per12ViewersFixtureBytes: bytes * 12 })
  }
}
const output = { scope: 'actual Java trajectories + actual AlkkagiReplay, synthetic 60fps render sampling/arrival; not live RTT/GPU/browser latency benchmark',
  rows }
fs.writeFileSync(path.join(folder, 'rendering.json'), JSON.stringify(output, null, 2))
console.log(JSON.stringify(rows.filter(r => r.scenario === 'board32-p13-1.0' && r.model === 'candidate-separated'), null, 2))
