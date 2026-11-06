import { beforeEach, afterEach, expect, it, vi } from 'vitest'
const fixture = vi.hoisted(() => ({ session: { sessionId: '42', status: 'connected' }, request: vi.fn(), storage: new Map<string, string>() }))
vi.mock('../../src/network/worldClient', () => ({ useSession: { getState: () => fixture.session } }))
vi.mock('../../src/park/runtime/runtime', () => ({ parkRuntime: { requestJSON: fixture.request } }))
import { gachaAction, refreshGacha, resetGacha, useGacha } from '../../src/features/gacha/state'
import { acceptGacha } from '../../src/features/gacha/events'
import { RestError } from '../../src/network/restError'

const machine = (version = 0, roundId = '1') => ({ version, roundId, remaining: 30,
  prizes: [1, 2, 4, 8, 15].map((remaining, i) => ({ grade: i + 1, initial: remaining, remaining, value: [1000, 500, 250, 100, 20][i] })) })
const inventory = { tickets: 1, balance: 900, availableBalance: 900, boxes: [1, 2, 3, 4].map(grade => ({ grade, quantity: 0 })) }
const state = { enabled: true, ticketPrice: 100, machine: machine(), inventory, products: [] }
beforeEach(async () => {
  resetGacha(); fixture.storage.clear(); fixture.request.mockReset(); fixture.session = { sessionId: '42', status: 'connected' }
  vi.stubGlobal('sessionStorage', { getItem: (key: string) => fixture.storage.get(key) ?? null,
    setItem: (key: string, value: string) => fixture.storage.set(key, value), removeItem: (key: string) => fixture.storage.delete(key) })
  vi.stubGlobal('window', new EventTarget())
  fixture.request.mockResolvedValue(state); await refreshGacha(); fixture.request.mockClear()
})
afterEach(() => vi.unstubAllGlobals())
it('응답 유실과 인증·429 오류 후에도 동일 작업 ID를 유지한다', async () => {
  fixture.request.mockRejectedValueOnce(new Error('응답 유실'))
  await gachaAction('BUY')
  const first = fixture.request.mock.calls[0]![1].body
  for (const code of [new RestError(401, 'UNAUTHENTICATED', '로그인 필요'), new RestError(429, 'RATE_LIMITED', '요청 제한')]) {
    fixture.request.mockRejectedValueOnce(code); await gachaAction('BUY')
    expect(useGacha.getState().pending).not.toBeNull()
    expect(fixture.request.mock.calls.at(-1)![1].body).toBe(first)
  }
  resetGacha(); fixture.request.mockResolvedValueOnce(state); await refreshGacha()
  expect(useGacha.getState().pending?.operationId).toBe(JSON.parse(first).operationId)
})
it('회차 변경으로 미사용이 확정되면 요청을 정리하고 새 회차를 조회한다', async () => {
  fixture.request.mockRejectedValueOnce(new RestError(409, 'GACHA_ROUND_CHANGED', '새 회차')).mockResolvedValueOnce({ ...state, machine: machine(1, '2') })
  await gachaAction('DRAW')
  expect(useGacha.getState().pending).toBeNull()
  expect(useGacha.getState().state?.inventory.tickets).toBe(1)
  expect(useGacha.getState().state?.machine.roundId).toBe('2')
})
it('화면에 수신한 최신 기계 회차를 요청에 사용한다', async () => {
  acceptGacha({ eventId: 'aa7baf0b-0246-4391-adef-a247f90ac50a', machine: machine(2, '3'), winner: null })
  fixture.request.mockRejectedValueOnce(new Error('중단'))
  await gachaAction('DRAW')
  expect(JSON.parse(fixture.request.mock.calls[0]![1].body).roundId).toBe('3')
})
it('계정이 바뀌는 동안 도착한 결과는 다른 계정에 적용하지 않는다', async () => {
  let done!: (value: unknown) => void
  fixture.request.mockImplementationOnce(() => new Promise(resolve => { done = resolve }))
  const operation = gachaAction('BUY'), key = useGacha.getState().pending!.operationId
  fixture.session = { sessionId: '99', status: 'connected' }
  done({ operationId: key, kind: 'BUY', roundId: null, grade: 0, product: null, duplicate: false,
    paidCoins: 100, awardedCoins: 0, inventory, completedAt: '2026-11-06T00:00:00Z' })
  await operation
  expect(useGacha.getState().result).toBeNull()
  expect(fixture.storage.has('ontop:gacha:pending:42')).toBe(true)
  fixture.request.mockResolvedValue(state); await refreshGacha()
  expect(useGacha.getState().owner).toBe('99'); expect(useGacha.getState().pending).toBeNull()
})
