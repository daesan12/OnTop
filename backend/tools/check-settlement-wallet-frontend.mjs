import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

// 팀원 DB/FE 소스는 수정하지 않는다. loopback 전용 DB의 실제 응답을 현재 FE 파서에 입력한다.
const backend = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const frontend = resolve(backend, '../frontend')
assert.match(process.env.TEST_GAME_WALLET_FLOW_DB_URL ?? '',
  /^jdbc:mysql:\/\/127\.0\.0\.1:[0-9]+\/ontop_game_test_ws72_[A-Za-z0-9_]+(?:\?.*)?$/,
  '전용 loopback 검증 DB 환경변수가 필요합니다.')
const runId = randomUUID()
const command = process.platform === 'win32' ? 'cmd.exe' : './gradlew'
const args = process.platform === 'win32'
  ? ['/d', '/c', 'gradlew.bat mysqlTest --tests com.ssafy.ontop.table.GameSettlementWalletFlowMySqlTests']
  : ['mysqlTest', '--tests', 'com.ssafy.ontop.table.GameSettlementWalletFlowMySqlTests']
const test = spawnSync(command, args, { cwd: backend, stdio: 'inherit',
  env: { ...process.env, ONTOP_SETTLEMENT_WIRE_RUN_ID: runId } })
if (test.error) throw test.error
assert.equal(test.status, 0, '실제 DB/WS 흐름 실패: 이전 응답으로 FE 검수를 계속하지 않습니다.')
const capture = JSON.parse(await readFile(resolve(backend, 'build/reports/game-settlement-wallet-flow.json'), 'utf8'))
assert.equal(capture.schemaVersion, 1)
assert.equal(capture.runId, runId)
assert.deepEqual(capture.scenarios.map(s => s.scenario).sort(), ['FIVE_IN_ROW', 'FORFEIT_SETTLE_THEN_LEAVE'])
const require = createRequire(resolve(frontend, 'package.json'))
const { createServer } = await import(pathToFileURL(require.resolve('vite')).href)
const server = await createServer({ root: frontend, configFile: false, appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null } })
try {
  const { parseEnvelope } = await server.ssrLoadModule('/src/network/protocol.ts')
  const { parseResult } = await server.ssrLoadModule('/src/game/protocol.ts')
  const { receiveWalletSettlement, useWalletSettlement } =
    await server.ssrLoadModule('/src/features/wallet/settlementRefresh.ts')
  const { walletBalance } = await server.ssrLoadModule('/src/features/wallet/balance.ts')
  for (const scenario of capture.scenarios) {
    assert.equal(scenario.ledgerEntries, 4)
    for (const role of ['winner', 'loser']) {
      const user = scenario[`${role}UserId`]
      const result = parseEnvelope(JSON.stringify(scenario[`${role}Result`]))
      const parsed = parseResult(result.payload, user)
      assert.equal(parsed.settlementStatus, 'SETTLED')
      assert.equal(parsed.myCoinDelta, role === 'winner' ? 5 : -5)
      const before = useWalletSettlement.getState().revision
      // 실제 알림이 아닌 입력 거절 계약도 같은 FE 구현으로 확인한다.
      receiveWalletSettlement({ ...result, payload: { ...result.payload, settlementStatus: 'PENDING', myCoinDelta: null } }, user)
      receiveWalletSettlement(result, 'not-a-participant')
      assert.equal(useWalletSettlement.getState().revision, before)
      receiveWalletSettlement(result, user)
      assert.deepEqual(useWalletSettlement.getState(), { owner: user, revision: before + 1 })
      receiveWalletSettlement(result, user)
      assert.equal(useWalletSettlement.getState().revision, before + 1, '같은 결과는 잔액 갱신을 반복하지 않는다.')
      assert.equal(walletBalance(scenario[`${role}Wallet`]), role === 'winner' ? 105 : 95)
    }
  }
  console.log('PASS: 실제 MySQL 예약→엔진 종료→정산/outbox→Raw WS 4개 결과→즉시 지갑 HTTP 조회→현재 FE 파서·잔액 갱신 신호')
  console.log('범위: 정상 승리·기권, 중복 조회/알림, 비참가자 차단, 퇴장·재접속. 3D 화면/개발 서버 적용 검수는 별도.')
} finally { await server.close() }
