import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test from 'node:test'
import { checkFrontendConnection, originUrl } from './check-frontend-connection.mjs'

const origin = 'https://dev.on-top.world'

async function fixture(t, respond) {
  const requests = []
  const server = createServer((request, response) => {
    requests.push({ method: request.method, headers: request.headers, path: request.url })
    respond(request, response)
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  return { baseUrl: `http://127.0.0.1:${server.address().port}`, requests }
}

function normal(request, response) {
  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST',
      'Access-Control-Allow-Headers': 'authorization',
    }).end()
  } else {
    response.writeHead(request.url === '/actuator/health' ? 200 : 401,
      { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin })
      .end(JSON.stringify(request.url === '/actuator/health' ? { status: 'UP' } : { code: 'AUTH_REQUIRED' }))
  }
}

test('실제 HTTP로 GET/OPTIONS만 보내고 인증·API 활성화 완료와 구분한다', async t => {
  const { baseUrl, requests } = await fixture(t, normal)
  const report = await checkFrontendConnection({ baseUrl, origin })
  assert.equal(report.basicConnectionChecksPassed, true, JSON.stringify(report))
  assert.equal(report.checks.length, 8)
  assert.equal(requests.length, 8)
  assert.equal(requests.filter(request => request.method === 'GET').length, 4)
  assert.equal(requests.filter(request => request.method === 'OPTIONS').length, 4)
  for (const request of requests) {
    assert.equal(request.headers.authorization, undefined)
    assert.equal(request.headers.cookie, undefined)
  }
  // 존재하지 않는 API도 동일한 인증 필터 응답을 받을 수 있다.
  assert.equal(report.apiImplementationVerified, false)
  assert.equal(report.loginVerified, false)
  assert.equal(report.websocketConnectionVerified, false)
  assert.equal(report.databaseBusinessFlowVerified, false)
})

test('허용 Origin이 다르면 인증 401이어도 CORS 성공으로 처리하지 않는다', async t => {
  const { baseUrl } = await fixture(t, (request, response) => {
    if (request.method !== 'OPTIONS') return normal(request, response)
    response.writeHead(200, {
      'Access-Control-Allow-Origin': 'https://other.invalid',
      'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'Authorization',
    }).end()
  })
  const report = await checkFrontendConnection({ baseUrl, origin })
  assert.equal(report.basicConnectionChecksPassed, false)
  assert.equal(report.checks.find(check => check.kind === 'health').passed, true)
  assert.equal(report.checks.filter(check => check.kind === 'cors').every(check => check.httpStatus === 200), true)
  assert.equal(report.checks.filter(check => check.kind === 'cors' && !check.passed).length, 4)
})

test('OPTIONS 200만으로 성공시키지 않고 요청 메서드와 헤더를 검사한다', async t => {
  const { baseUrl } = await fixture(t, (request, response) => {
    if (request.method !== 'OPTIONS') return normal(request, response)
    response.writeHead(200, { 'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET', 'Access-Control-Allow-Headers': 'Content-Type' }).end()
  })
  const report = await checkFrontendConnection({ baseUrl, origin })
  assert.equal(report.basicConnectionChecksPassed, false)
  assert.equal(report.checks.filter(check => check.kind === 'cors' && check.passed).length, 0)
})

test('preflight가 정상이어도 실제 GET 응답에 올바른 CORS가 없으면 실패한다', async t => {
  for (const allowOrigin of [undefined, 'https://other.invalid']) {
    const { baseUrl } = await fixture(t, (request, response) => {
      if (request.method === 'OPTIONS' || request.url === '/actuator/health') return normal(request, response)
      const headers = { 'Content-Type': 'application/json' }
      if (allowOrigin) headers['Access-Control-Allow-Origin'] = allowOrigin
      response.writeHead(401, headers).end(JSON.stringify({ code: 'AUTH_REQUIRED' }))
    })
    const report = await checkFrontendConnection({ baseUrl, origin })
    assert.equal(report.basicConnectionChecksPassed, false)
    assert.equal(report.checks.filter(check => check.kind === 'cors' && check.passed).length, 4)
    assert.equal(report.checks.filter(check => check.kind === 'auth-boundary' && !check.passed).length, 3)
  }
})

test('헬스 503·HTML 인증 응답·리다이렉트를 통과시키거나 원문을 출력하지 않는다', async t => {
  const { baseUrl } = await fixture(t, (request, response) => {
    if (request.url === '/actuator/health') {
      return response.writeHead(503, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ status: 'DOWN', secret: 'do-not-report' }))
    }
    if (request.method === 'GET') {
      return response.writeHead(401, { 'Content-Type': 'text/html' }).end('do-not-report')
    }
    response.writeHead(302, { Location: '/should-not-follow' }).end()
  })
  const report = await checkFrontendConnection({ baseUrl, origin })
  assert.equal(report.basicConnectionChecksPassed, false)
  assert.equal(report.checks.find(check => check.kind === 'health').httpStatus, 503)
  assert.equal(report.checks.filter(check => check.passed).length, 0)
  assert.equal(JSON.stringify(report).includes('do-not-report'), false)
})

test('Actuator vendor JSON의 UP 상태를 올바르게 읽는다', async t => {
  const { baseUrl } = await fixture(t, (request, response) => {
    if (request.url !== '/actuator/health') return normal(request, response)
    response.writeHead(200, { 'Content-Type': 'application/vnd.spring-boot.actuator.v3+json;charset=UTF-8' })
      .end(JSON.stringify({ status: 'UP' }))
  })
  assert.equal((await checkFrontendConnection({ baseUrl, origin })).basicConnectionChecksPassed, true)
})

test('GET 허용이 있어도 접속권 POST preflight 허용이 없으면 실패한다', async t => {
  const { baseUrl } = await fixture(t, (request, response) => {
    if (request.method !== 'OPTIONS') return normal(request, response)
    response.writeHead(200, { 'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET', 'Access-Control-Allow-Headers': 'Authorization' }).end()
  })
  const report = await checkFrontendConnection({ baseUrl, origin })
  assert.equal(report.checks.filter(check => check.kind === 'cors' && check.passed).length, 3)
  assert.equal(report.checks.find(check => check.requestedMethod === 'POST').passed, false)
})

test('계정·쿼리·해시가 있는 주소는 전송 전에 거절한다', async () => {
  for (const value of ['https://u:secret@example.com', 'https://example.com?ticket=secret',
    'https://example.com/#secret', 'https://example.com/api', 'file:///tmp/test', 'invalid']) {
    assert.throws(() => originUrl(value, 'baseUrl'))
    let sent = false
    await assert.rejects(checkFrontendConnection({ baseUrl: value, origin,
      fetchImpl: async () => { sent = true } }))
    assert.equal(sent, false)
  }
})

test('네트워크 예외 메시지는 보고서에 노출하지 않는다', async () => {
  const report = await checkFrontendConnection({ baseUrl: 'https://example.invalid', origin,
    fetchImpl: async () => { throw new Error('internal-sensitive-value') } })
  assert.equal(report.basicConnectionChecksPassed, false)
  assert.equal(report.checks.every(check => check.httpStatus === null), true)
  assert.equal(JSON.stringify(report).includes('internal-sensitive-value'), false)
})
