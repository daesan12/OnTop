import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// FE 소스는 읽기만 한다. 실제 로컬 WS 테스트 응답을 사용하며 서비스/DB/배포에 접속하지 않는다.
const backend = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const frontend = resolve(backend, '../frontend')
const runId = randomUUID()
const command = process.platform === 'win32' ? 'cmd.exe' : './gradlew'
const args = process.platform === 'win32'
  ? ['/d', '/c', 'gradlew.bat test --tests com.ssafy.ontop.table.WorldFrontendWireContractTests --rerun-tasks']
  : ['test', '--tests', 'com.ssafy.ontop.table.WorldFrontendWireContractTests', '--rerun-tasks']
const test = spawnSync(command, args, { cwd: backend, stdio: 'inherit',
  env: { ...process.env, ONTOP_EXPORT_WORLD_WIRE: '1', ONTOP_WORLD_WIRE_RUN_ID: runId } })
if (test.error) throw test.error
assert.equal(test.status, 0, '실제 WS 테스트 실패: 이전 캡처로 검수를 계속하지 않습니다.')
const require = createRequire(resolve(frontend, 'package.json'))
const { createServer } = await import(pathToFileURL(require.resolve('vite')).href)
const capture = JSON.parse(await readFile(resolve(backend, 'build/reports/world-frontend-wire.json'), 'utf8'))
assert.equal(capture.schemaVersion, 1)
assert.equal(capture.runId, runId, '이번 테스트 실행에서 생성한 응답만 검수합니다.')
assert.ok(capture.actorUserId && capture.tableId)
const server = await createServer({ root: frontend, configFile: false, appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null } })
try {
  const { parseEnvelope, worldState } = await server.ssrLoadModule('/src/network/protocol.ts')
  const { parseEmoteEvent, parseEmoteCancellation, EmoteTimeline } =
    await server.ssrLoadModule('/src/features/emotes/timeline.ts')
  const frames = Object.fromEntries(Object.entries(capture.frames).map(([name, frame]) =>
    [name, parseEnvelope(JSON.stringify(frame))]))
  const expected = ['initial', 'wave', 'movementCancelled', 'clap', 'activityCancelled', 'seated', 'left']
  assert.deepEqual(Object.keys(frames).sort(), expected.sort())
  for (const frame of Object.values(frames)) assert.equal(frame.requestId, null, '비참가자 방송이어야 합니다.')
  const avatar = name => {
    assert.equal(frames[name].type, 'WORLD_STATE')
    const result = worldState(frames[name].payload).avatars.find(a => a.userId === capture.actorUserId)
    assert.ok(result, `${name}: 아바타 누락`)
    return result
  }
  assert.equal(avatar('initial').tableSeat, null)
  assert.deepEqual(avatar('seated').tableSeat, { tableId: capture.tableId, seatNumber: 1 })
  assert.equal(avatar('left').tableSeat, null)
  assert.ok(frames.seated.payload.version > frames.initial.payload.version)
  assert.ok(frames.left.payload.version > frames.seated.payload.version)

  const timeline = new EmoteTimeline()
  for (const [eventName, cancellationName, code, reason] of [
    ['wave', 'movementCancelled', 'WAVE', 'MOVEMENT'],
    ['clap', 'activityCancelled', 'CLAP', 'ACTIVITY_STARTED'],
  ]) {
    assert.equal(frames[eventName].type, 'WORLD_EMOTE_EVENT')
    assert.equal(frames[cancellationName].type, 'WORLD_EMOTE_CANCELLED')
    const event = parseEmoteEvent(frames[eventName].payload)
    const cancellation = parseEmoteCancellation(frames[cancellationName].payload)
    assert.equal(event.emoteCode, code)
    assert.equal(event.userId, capture.actorUserId)
    assert.equal(cancellation.emoteEventId, event.eventId)
    assert.equal(cancellation.reason, reason)
    const at = Date.parse(event.sentAt)
    assert.ok(timeline.accept(event, `EMOTE_${code}`, at), `${code}: 실제 서버 이벤트 수용`)
    assert.equal(timeline.accept(event, `EMOTE_${code}`, at), null, '중복 이벤트 거절')
    assert.equal(timeline.cancelEvent(cancellation, Date.parse(cancellation.sentAt)), true)
    assert.equal(timeline.cancelEvent(cancellation, Date.parse(cancellation.sentAt)), false, '중복 취소 거절')
  }
  console.log('PASS: 실제 Raw WebSocket 응답 7개 → 최신 FE 파서·감정표현 타임라인 (공개 좌석·취소·재선택·중복 방지)')
} finally {
  await server.close()
}
