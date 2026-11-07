import { beforeEach, afterEach, expect, it, vi } from 'vitest'
const fixture = vi.hoisted(() => ({ session: { sessionId: '42', status: 'connected' }, request: vi.fn(), storage: new Map<string, string>() }))
vi.mock('../../src/network/worldClient', () => ({ useSession: { getState: () => fixture.session } }))
vi.mock('../../src/park/runtime/runtime', () => ({ parkRuntime: { requestJSON: fixture.request } }))
import { gachaAction, refreshGacha, resetGacha, useGacha } from '../../src/features/gacha/state'
import { acceptGacha } from '../../src/features/gacha/events'
import { RestError } from '../../src/network/restError'
import { gachaClock, refillRemaining } from '../../src/features/gacha/timing'

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
it('보유 수량 초과가 확정되면 미소비 요청을 정리한다',async()=>{
  fixture.request.mockRejectedValueOnce(new RestError(409,'GACHA_CAPACITY_EXCEEDED','보유 한도 초과'))
  await gachaAction('BUY')
  expect(useGacha.getState().pending).toBeNull()
  expect(fixture.storage.size).toBe(0)
  expect(useGacha.getState().error).toBe('보유 한도 초과')
})
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
it('서버 보충 중 응답은 키를 정리하고 GET만 하며 종료 후에도 자동 추첨하지 않는다', async () => {
  const serverNow='2026-11-07T10:00:00.000Z',refillEndsAt='2026-11-07T10:00:03.000Z'
  fixture.request.mockRejectedValueOnce(new RestError(409,'GACHA_REFILLING','보충 중'))
    .mockResolvedValueOnce({...state,serverNow,machine:{...machine(1,'2'),refillEndsAt}})
  await gachaAction('DRAW')
  expect(useGacha.getState().pending).toBeNull()
  expect(fixture.storage.size).toBe(0)
  expect(useGacha.getState().error).toBe('')
  expect(useGacha.getState().transition).toBe('REFILLING')
  expect(fixture.request.mock.calls.filter(c=>c[1]?.method==='POST')).toHaveLength(1)
  const current=useGacha.getState().state!.machine
  expect(refillRemaining(current,performance.now()+4000)).toBe(0)
  expect(fixture.request.mock.calls.filter(c=>c[1]?.method==='POST')).toHaveLength(1)
  expect(useGacha.getState().state?.inventory.tickets).toBe(1)
})
it('알려진 보충 중에는 새 추첨을 보내지 않지만 구매는 허용한다', async () => {
  const serverNow='2026-11-07T10:00:00.000Z',refillEndsAt='2026-11-07T10:00:03.000Z'
  fixture.request.mockResolvedValueOnce({...state,serverNow,machine:{...machine(1,'2'),refillEndsAt}})
  await refreshGacha();fixture.request.mockClear()
  await gachaAction('DRAW');expect(fixture.request).not.toHaveBeenCalled()
  expect(useGacha.getState().pending).toBeNull()
  fixture.request.mockRejectedValueOnce(new Error('구매 응답 유실'))
  await gachaAction('BUY')
  expect(fixture.request.mock.calls[0]![0]).toBe('/api/v1/gacha/tickets')
})
it('다른 사람이 S급을 뽑아도 이미 확정됐을 수 있는 이전 ID는 복구한다', async () => {
  fixture.request.mockRejectedValueOnce(new Error('응답 유실'));await gachaAction('DRAW')
  const first=JSON.parse(fixture.request.mock.calls[0]![1].body)
  const serverNow='2026-11-07T10:00:00.000Z',refillEndsAt='2026-11-07T10:00:03.000Z'
  gachaClock.sync(Date.parse(serverNow),performance.now())
  acceptGacha({eventId:'aa7baf0b-0246-4391-adef-a247f90ac50a',machine:{...machine(1,'2'),refillEndsAt},winner:null})
  fixture.request.mockResolvedValueOnce({operationId:first.operationId,kind:'DRAW',roundId:'1',grade:1,product:null,duplicate:false,
    paidCoins:0,awardedCoins:0,inventory,completedAt:serverNow}).mockResolvedValueOnce({...state,serverNow,machine:{...machine(1,'2'),refillEndsAt}})
  await gachaAction('DRAW')
  expect(JSON.parse(fixture.request.mock.calls[1]![1].body)).toEqual(first)
  expect(useGacha.getState().result?.roundId).toBe('1')
  expect(useGacha.getState().result?.operationId).toBe(first.operationId)
  expect(useGacha.getState().pending).toBeNull()
})
