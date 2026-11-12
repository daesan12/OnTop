import { expect, it } from 'vitest'
import { gachaFailureMessage } from '../../src/features/gacha/errors'
import { RestError } from '../../src/network/restError'

it('네트워크·서버·해석 오류는 내부 메시지 없이 한국어 재조회 안내를 보여준다', () => {
  for (const cause of [new TypeError('Failed to fetch'), new RestError(503, 'UNEXPECTED', 'SQL secret'), new SyntaxError('Unexpected token'), null]) {
    expect(gachaFailureMessage(cause)).toContain('다시 불러오기')
    expect(gachaFailureMessage(cause, true)).toContain('이전 거래 결과')
    expect(gachaFailureMessage(cause)).not.toMatch(/Failed|SQL|secret|Unexpected/)
  }
})
it('시간 초과·인증·요청 제한은 다음 행동을 안내한다', () => {
  expect(gachaFailureMessage(new DOMException('internal', 'TimeoutError'))).toContain('시간이 오래')
  expect(gachaFailureMessage(new DOMException('internal', 'TimeoutError'), true)).toContain('결과 확인이 늦어')
  for (const [status, word] of [[401, '다시 로그인'], [403, '접속 상태'], [429, '조금 기다린']] as const)
    expect(gachaFailureMessage(new RestError(status, 'ERROR', 'internal'))).toContain(word)
})
it('알려진 거래 거절은 사유를 보여주고 모르는 오류 코드는 그대로 노출하지 않는다', () => {
  for (const code of ['GACHA_NOT_CONFIGURED', 'GACHA_NO_TICKET', 'GACHA_NO_BOX', 'INSUFFICIENT_BALANCE', 'GACHA_NO_COMPATIBLE_PRODUCT', 'GACHA_CAPACITY_EXCEEDED', 'INVALID_REQUEST'])
    expect(gachaFailureMessage(new RestError(409, code, 'internal'), true)).not.toContain('internal')
  expect(gachaFailureMessage(new RestError(500, 'toString', 'internal'))).toContain('다시 불러오기')
})
