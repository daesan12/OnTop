import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// JUnit의 이번 실행에서 받은 실제 HTTP 응답만 사용한다. 토큰/쿠키는 파일에 쓰지 않는다.
assert.ok(process.argv[2], 'JUnit에서 생성한 응답 파일을 지정하세요.')
const wire = JSON.parse(await readFile(process.argv[2], 'utf8'))
const frontend = resolve(dirname(fileURLToPath(import.meta.url)), '../../frontend')
const require = createRequire(resolve(frontend, 'package.json'))
const { createServer } = await import(pathToFileURL(require.resolve('vite')).href)
const server = await createServer({ root: frontend, configFile: false, appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null } })
try {
  const { fetchRanking, parseRanking, appendRanking } = await server.ssrLoadModule('/src/features/bungeoppang/ranking.ts')
  const signal = new AbortController().signal
  const request = (body, cursor) => async (path, init) => {
    const url = new URL(path, 'http://127.0.0.1')
    assert.equal(url.pathname, '/api/v1/minigames/bungeoppang/rankings')
    assert.equal(url.searchParams.get('period'), 'ALL_TIME')
    assert.equal(url.searchParams.get('rulesVersion'), 'v5')
    assert.equal(url.searchParams.get('limit'), '20')
    assert.equal(url.searchParams.get('cursor'), cursor ?? null)
    assert.equal(init.cache, 'no-store')
    assert.equal(init.signal, signal)
    return body
  }
  const first = await fetchRanking(request(wire.first), 'v5', '42', signal)
  const second = await fetchRanking(request(wire.second, first.nextCursor), 'v5', '42', signal, first.nextCursor)
  const merged = appendRanking(first, second)
  assert.equal(first.items.length, 20)
  assert.deepEqual(merged.items.slice(19).map(item => item.rank), [20, 20, 22])
  assert.equal(merged.items.length, 22)
  assert.equal(new Set(merged.items.map(item => item.userId)).size, 22)
  assert.equal(merged.nextCursor, null)
  assert.deepEqual(merged.me, first.me)
  assert.equal(merged.me.rank, 22)
  for (const name of ['expired', 'otherUser', 'otherVersion', 'otherLimit']) {
    assert.equal(wire[name].code, 'RANKING_SNAPSHOT_EXPIRED')
  }
  assert.equal(wire.invalid.code, 'INVALID_CURSOR')
  // 409를 빈 목록/성공으로 해석하지 않는다. 사용자가 처음부터 재시도하면 새 응답을 사용한다.
  await assert.rejects(() => fetchRanking(async () => { throw new Error(wire.expired.code) },
    'v5', '42', signal, first.nextCursor), /RANKING_SNAPSHOT_EXPIRED/)
  const fresh = await fetchRanking(request(wire.fresh), 'v5', '42', signal)
  assert.equal(fresh.me.rank, 1)
  assert.equal(fresh.me.made, 200)
  assert.notEqual(fresh.snapshotId, first.snapshotId)
  assert.throws(() => appendRanking(first, fresh), /랭킹 응답/)
  const empty = parseRanking(wire.empty, 'v4', '42')
  assert.deepEqual(empty.items, [])
  assert.equal(empty.totalParticipants, 0)
  assert.equal(empty.me, null)
  assert.equal(empty.nextCursor, null)
  console.log('PASS: 실제 HTTP → 무수정 FE 요청/파서/병합; 기본20명·경계동점·22명 중복없음·새기록 격리')
  console.log('PASS: 소유자/버전/limit 커서 격리·만료409·처음부터 갱신·혼합 스냅샷 거절·v4 빈 기록')
  console.log('범위: 로컬 회원/DB 조회 fixture·제어 시계. 실제 DB/로그인 계정/React 화면 검수와 구분.')
} finally { await server.close() }
