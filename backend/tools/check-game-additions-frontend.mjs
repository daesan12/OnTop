import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const backend = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const frontend = resolve(backend, '../frontend')
assert.match(process.env.TEST_BUNGEO_RANKING_DB_URL ?? '',
  /^jdbc:mysql:\/\/127\.0\.0\.1:[0-9]+\/ontop_ranking_test_bungeo_[A-Za-z0-9_]+(?:\?.*)?$/)
const runId = randomUUID()
function test(task, target) {
  const command = process.platform === 'win32' ? 'cmd.exe' : './gradlew'
  const args = process.platform === 'win32'
    ? ['/d', '/c', `gradlew.bat ${task} --tests ${target} --rerun-tasks`]
    : [task, '--tests', target, '--rerun-tasks']
  const result = spawnSync(command, args, { cwd: backend, stdio: 'inherit',
    env: { ...process.env, ONTOP_GAME_ADDITIONS_RUN_ID: runId } })
  if (result.error) throw result.error
  assert.equal(result.status, 0, '실제 서버 검사 실패: 이전 응답으로 FE 검수를 계속하지 않는다.')
}
test('test', 'com.ssafy.ontop.table.OneCardPrankFlowTests')
test('mysqlTest', 'com.ssafy.ontop.ranking.BungeoppangRankingMySqlTests')
const wire = JSON.parse(await readFile(resolve(backend, 'build/reports/onecard-prank-wire.json'), 'utf8'))
const ranking = JSON.parse(await readFile(resolve(backend, 'build/reports/bungeoppang-ranking-wire.json'), 'utf8'))
assert.equal(wire.runId, runId)
assert.equal(ranking.runId, runId)
const require = createRequire(resolve(frontend, 'package.json'))
const { createServer } = await import(pathToFileURL(require.resolve('vite')).href)
const server = await createServer({ root: frontend, configFile: false, appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null } })
try {
  const { parseEnvelope } = await server.ssrLoadModule('/src/network/protocol.ts')
  const { OneCardDefenseEvents, useOneCardDefense } = await server.ssrLoadModule('/src/game/onecard/defenseEvents.ts')
  const { OneCardPrankEvents, useOneCardPranks } = await server.ssrLoadModule('/src/game/onecard/prankEvents.ts')
  const { parseRanking, appendRanking } = await server.ssrLoadModule('/src/features/bungeoppang/ranking.ts')
  const scope = { key: 'wire-contract', gameId: wire.gameId, ownId: wire.targetUserId, role: 'PLAYER',
    turnCount: wire.turnCount, turnUserId: wire.targetUserId, canSend: false, canRestore: true,
    handIds: ['local-a', 'local-protected', 'local-b'], protectedId: 'local-protected' }
  const deps = { enabled: true, scope: () => scope, now: () => 1000,
    request: async () => { throw new Error('수신 계약 검증에서 추가 요청하지 않는다.') } }
  const defense = new OneCardDefenseEvents({ ...deps, canReach: () => true })
  const frame = name => parseEnvelope(JSON.stringify(wire[name]))
  assert.equal(defense.accept(frame('reach')), true)
  assert.equal(useOneCardDefense.getState().attempts.length, 1)
  assert.equal(defense.accept(frame('blocked')), true)
  assert.equal(useOneCardDefense.getState().attempts.length, 0)
  assert.equal(useOneCardDefense.getState().lastBlock?.attemptId, wire.reach.payload.attemptId)
  const block = useOneCardDefense.getState().lastBlock
  defense.accept(frame('blocked'))
  assert.deepEqual(useOneCardDefense.getState().lastBlock, block)
  defense.accept(frame('secondReach'))
  assert.equal(useOneCardDefense.getState().attempts.length, 1, '다른 관전자까지 차단하지 않는다.')
  const pranks = new OneCardPrankEvents(deps)
  assert.equal(pranks.accept(frame('flipped')), true)
  assert.deepEqual(useOneCardPranks.getState().flippedIds, ['local-a', 'local-b'])
  assert.equal(pranks.accept(frame('restored')), true)
  assert.equal(useOneCardPranks.getState().effect, null)
  assert.deepEqual(useOneCardPranks.getState().flippedIds, [])
  let page = parseRanking(ranking.first, 'v5', ranking.ownUserId, 120000)
  for (const name of ['second', 'third', 'fourth']) {
    page = appendRanking(page, parseRanking(ranking[name], 'v5', ranking.ownUserId, 120000))
  }
  assert.deepEqual(page.items.map(item => item.rank), [1, 1, 3, 4])
  assert.equal(new Set(page.items.map(item => item.userId)).size, 4)
  assert.equal(page.nextCursor, null)
  assert.equal(parseRanking(ranking.fresh, 'v5', ranking.ownUserId, 120000).items[0].made, 15)
  assert.equal(ranking.zeroComplete.status, 'COMPLETED')
  assert.equal(ranking.zeroComplete.rewardAmount, 0)
  assert.equal(parseRanking(ranking.zeroRanking, 'v4', ranking.zeroUserId).me.made, 0)
  assert.equal(ranking.zeroCompleteV5.status, 'COMPLETED')
  assert.equal(parseRanking(ranking.zeroRankingV5, 'v5', ranking.zeroUserId, 120000).me.made, 0)
  console.log('PASS: 실제 Raw WS 원카드 방어·뒤집기·복구 → 무수정 FE 이벤트/보호 카드 처리')
  console.log('PASS: 실제 MySQL/HTTP 붕어빵 최고 기록·동점·고정 페이지·보상0 완료 → 무수정 FE 랭킹 파서')
  console.log('범위: 로컬 계약 검수. 운영 기능 플래그·배포·실계정 3D 화면 검수는 별도.')
} finally { await server.close() }
