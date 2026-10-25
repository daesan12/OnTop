import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const protectedPaths = [
  '/api/v1/channels', '/api/v1/tables?channelId=channel-1', '/api/v1/rankings',
]

export function originUrl(value, label) {
  let url
  try { url = new URL(value) } catch { throw new Error(`${label}: 올바른 http/https 주소가 필요합니다.`) }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
      || url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`${label}: 계정·경로·쿼리·해시 없이 origin만 입력해주세요.`)
  }
  return url.origin
}

/** 토큰·쿠키 없이 GET/OPTIONS만 전송한다. 실제 API 등록·로그인·WS·DB 완료를 판정하지 않는다. */
export async function checkFrontendConnection({ baseUrl, origin, timeoutMs = 5000, fetchImpl = fetch }) {
  const backend = originUrl(baseUrl, 'baseUrl')
  const frontend = originUrl(origin, 'origin')
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30000) {
    throw new Error('timeoutMs: 100~30000 정수가 필요합니다.')
  }
  const definitions = [
    { kind: 'health', method: 'GET', path: '/actuator/health' },
    ...protectedPaths.map(path => ({ kind: 'auth-boundary', method: 'GET', path })),
    ...protectedPaths.map(path => ({ kind: 'cors', method: 'OPTIONS', path, requestedMethod: 'GET' })),
    { kind: 'cors', method: 'OPTIONS', path: '/api/v1/auth/websocket-ticket', requestedMethod: 'POST' },
  ]
  const checks = await Promise.all(definitions.map(async definition => {
    const { kind, method, path, requestedMethod } = definition
    const headers = kind === 'health' ? {} : { Origin: frontend }
    if (kind === 'cors') {
      headers['Access-Control-Request-Method'] = requestedMethod
      headers['Access-Control-Request-Headers'] = 'Authorization'
    }
    let response
    try {
      response = await fetchImpl(backend + path, {
        method, headers, credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
      })
      if (kind === 'cors') {
        const tokens = name => (response.headers.get(name) ?? '').split(',').map(value => value.trim().toLowerCase())
        const passed = [200, 204].includes(response.status)
          && response.headers.get('access-control-allow-origin') === frontend
          && tokens('access-control-allow-methods').includes(requestedMethod.toLowerCase())
          && tokens('access-control-allow-headers').includes('authorization')
        await response.body?.cancel()
        return { ...definition, httpStatus: response.status, passed,
          detail: passed ? '요청한 프론트 Origin·메서드·Authorization 허용 확인' : 'CORS 응답·Origin·메서드·헤더 확인 필요' }
      }
      let body = null
      const mediaType = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
      if (mediaType === 'application/json' || mediaType.startsWith('application/') && mediaType.endsWith('+json')) {
        try { body = await response.json() } catch { /* 응답 본문·오류 상세는 출력하지 않는다. */ }
      } else {
        await response.body?.cancel()
      }
      if (kind === 'health') {
        const state = ['UP', 'DOWN', 'OUT_OF_SERVICE', 'UNKNOWN'].includes(body?.status) ? body.status : 'UNKNOWN'
        return { ...definition, httpStatus: response.status, passed: response.status === 200 && state === 'UP',
          detail: `공개 헬스 상태 ${state}; 업무 DB 흐름 검증은 별도` }
      }
      const corsAllowed = response.headers.get('access-control-allow-origin') === frontend
      const passed = response.status === 401 && typeof body?.code === 'string'
        && body.code.startsWith('AUTH_') && corsAllowed
      return { ...definition, httpStatus: response.status, passed,
        detail: passed ? '인증 차단·응답 CORS 확인; 실제 API 등록·활성화는 미확인'
          : 'AUTH_* 401 응답 및 실제 응답의 CORS Origin 확인 필요' }
    } catch {
      return { ...definition, httpStatus: response?.status ?? null, passed: false,
        detail: '연결·TLS·시간 초과·리다이렉트 확인 필요 (원문 오류는 출력하지 않음)' }
    }
  }))
  return {
    backend, frontend, basicConnectionChecksPassed: checks.every(check => check.passed), checks,
    apiImplementationVerified: false, loginVerified: false, websocketConnectionVerified: false,
    databaseBusinessFlowVerified: false,
    limitation: '401과 OPTIONS 성공은 API 구현·활성화의 증거가 아닙니다. 실제 로그인·WS·DB 업무 흐름은 별도 검증하세요.',
  }
}

async function main(args) {
  let baseUrl, origin, json = false
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--base-url') baseUrl = args[++index]
    else if (args[index] === '--origin') origin = args[++index]
    else if (args[index] === '--json') json = true
    else throw new Error('사용법: node backend/tools/check-frontend-connection.mjs --base-url <BE origin> --origin <FE origin> [--json]')
  }
  if (!baseUrl || !origin) throw new Error('--base-url과 --origin이 모두 필요합니다. 토큰은 입력하지 않습니다.')
  const report = await checkFrontendConnection({ baseUrl, origin })
  if (json) console.log(JSON.stringify(report, null, 2))
  else {
    console.log(`기본 접속 조건: ${report.basicConnectionChecksPassed ? '통과' : '확인 필요'}`)
    for (const check of report.checks) {
      console.log(`[${check.passed ? '정상' : '확인 필요'}] ${check.method} ${check.path} HTTP ${check.httpStatus ?? '응답 없음'} — ${check.detail}`)
    }
    console.log(report.limitation)
  }
  process.exitCode = report.basicConnectionChecksPassed ? 0 : 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 2 })
}
