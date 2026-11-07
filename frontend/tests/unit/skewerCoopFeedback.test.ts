import { afterEach, describe, expect, it, vi } from 'vitest'
import { HallPreview } from '../../src/features/skewer/serviceHall/previewModel'
import { CoopClient } from '../../src/features/skewer/coop/client'
import { OnlineHall } from '../../src/features/skewer/coop/drivers'
import { TABLES } from '../../src/features/skewer/serviceHall/plan'
import type { CoopSnapshot, CoopTransport } from '../../src/features/skewer/coop/contracts'
import { refreshWalletAfterSettlement } from '../../src/features/wallet/settlementRefresh'
import type { Envelope } from '../../src/network/protocol'

vi.mock('../../src/features/wallet/settlementRefresh', () => ({ refreshWalletAfterSettlement: vi.fn() }))
const id = 'skewer-coop-00000000-0000-4000-8000-000000000001'
const finished = (): CoopSnapshot => ({ gameId: id, version: 20, registered: true, privateState: { role: 'server', hall: new HallPreview().view() },
  publicState: { gameCode: 'SKEWER_COOP', phase: 'FINISHED', channelId: 'park', actionVersion: 1,
    remaining: 0, elapsed: 240, countdown: 0, score: 200, served: 1, paused: false, chefVR: false,
    rankingEligible: true, entryFee: 0, rewardStatus: 'SERVER_SETTLEMENT', message: '', endReason: 'SKEWER_TIME_UP',
    players: [{ userId: '101', role: 'server', ready: true, connected: true }, { userId: '202', role: 'chef', ready: true, connected: true }],
    greeting: { active: false, index: 0, remaining: 0, answered: false, responded: 0, speech: false } } })
const receipt = (settled: boolean) => ({ gameId: id, status: settled ? 'SETTLED' : 'PENDING', teamScore: 200,
  served: 1, endReason: 'SKEWER_TIME_UP', rankingStatus: settled ? 'REGISTERED' : 'PENDING', rankingReason: 'ELIGIBLE',
  coinsCalculated: 10, coinsGranted: settled ? 10 : null, todayEarned: settled ? 10 : null, dailyCap: 500,
  remainingToday: settled ? 490 : null, balance: settled ? 110 : null,
  rewardDate: settled ? '2026-11-07' : null, settledAt: settled ? '2026-11-07T00:00:00Z' : null })

function fixture() {
  let listener!: (message: Envelope) => boolean
  const requestJSON = vi.fn<CoopTransport['requestJSON']>().mockResolvedValue({ mine: null, rooms: [] })
  const request = vi.fn<CoopTransport['request']>().mockResolvedValue({ payload: {} } as Envelope)
  const client = new CoopClient({ scope: () => ({ userId: '101', channelId: 'park', connected: true }),
    requestJSON, request, subscribe: fn => { listener = fn; return () => {} } })
  return { client, request, requestJSON, publish: () => listener({ type: 'GAME_STATE', payload: finished() } as unknown as Envelope) }
}
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks() })

describe('꼬치왕 QA 피드백 회귀', () => {
  it('서버가 동시 입력을 거절해도 이동 직후 E로 주문을 받을 수 있다', async () => {
    const { client, request } = fixture()
    const snapshot = finished(); snapshot.publicState.phase = 'PLAYING'
    snapshot.publicState.elapsed = 0; snapshot.publicState.remaining = 240
    snapshot.privateState.hall!.position = { ...TABLES[0].approach }
    client.store.setState({ snapshot })
    let busy = false, release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const accepted: string[] = [], rejected: string[] = []
    request.mockImplementation(async (type, payload) => {
      if (type !== 'GAME_ACTION_SEND') return { type: 'GAME_STATE', payload: structuredClone(snapshot) } as unknown as Envelope
      if (busy) { rejected.push('GAME_ACTION_PENDING'); throw { code: 'GAME_ACTION_PENDING' } }
      busy = true
      const input = payload.input as { type: string; dx?: number }
      try {
        if (input.type === 'MOVE' && input.dx === 1) await gate
        accepted.push(input.type)
        if (input.type === 'INTERACT') snapshot.privateState.hall!.held = [1]
        return { type: 'GAME_ACTION_RESULT', payload: {} } as Envelope
      } finally { busy = false }
    })
    const driver = new OnlineHall(client)
    driver.step(0, 1, 0)
    await Promise.resolve()
    driver.press()
    driver.step(0, 0, 1) // E 뒤 새 이동이 와도 상호작용 직전 정지는 보존한다.
    release()
    await client.act({ type: 'CLEAN_CANCEL' }, true)
    expect(rejected).toEqual([])
    expect(accepted.slice(0, 3)).toEqual(['MOVE', 'MOVE', 'INTERACT'])
    expect(client.snapshot?.privateState.hall?.held).toEqual([1])
    expect(client.store.getState().error).toBe('')
    client.stop()
  })
  it('종료 알림 즉시 영수증을 읽고 미확정이면 500ms 뒤 확정값으로 지갑을 갱신한다', async () => {
    vi.useFakeTimers()
    const { client, requestJSON, publish } = fixture()
    let checks = 0
    requestJSON.mockImplementation(async path => path.includes('/result?') ? receipt(++checks > 1) : { mine: null, rooms: [] })
    client.start()
    try {
      publish(); publish()
      expect(checks).toBe(1)
      await vi.advanceTimersByTimeAsync(499)
      expect(checks).toBe(1)
      expect(refreshWalletAfterSettlement).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(1)
      expect(checks).toBe(2)
      expect(client.store.getState().result?.coinsGranted).toBe(10)
      expect(refreshWalletAfterSettlement).toHaveBeenCalledExactlyOnceWith('101', `skewer-coop:${id}`)
      await vi.advanceTimersByTimeAsync(5000)
      expect(checks).toBe(2)
    } finally { client.stop() }
  })
  it('결과 화면을 닫으면 미확정 영수증 자동 조회를 중단한다', async () => {
    vi.useFakeTimers()
    const { client, requestJSON, publish } = fixture()
    requestJSON.mockImplementation(async path => path.includes('/result?') ? receipt(false) : { mine: null, rooms: [] })
    client.start(); publish()
    await vi.advanceTimersByTimeAsync(0)
    client.stop()
    const calls = requestJSON.mock.calls.length
    await vi.advanceTimersByTimeAsync(5000)
    expect(requestJSON).toHaveBeenCalledTimes(calls)
  })
  it('잘못된 요리 조립은 주문표 재확인으로 안내하고 거리 오류와 구분한다', async () => {
    const { client, request } = fixture()
    const snapshot = finished(); snapshot.publicState.phase = 'PLAYING'
    client.store.setState({ snapshot })
    request.mockRejectedValue({ code: 'GAME_ACTION_INVALID_ACTION' })
    for (const type of ['THREAD', 'SUBMIT']) {
      await client.act({ type })
      expect(client.store.getState().error).toContain('주문표를 다시 확인해 주세요')
    }
    await client.act({ type: 'INTERACT' })
    expect(client.store.getState().error).toContain('거리')
    client.stop()
  })
  it('이동 확인에 추가 상태 왕복을 넣지 않아 다음 정지 입력을 지연시키지 않는다', async () => {
    const { client, request } = fixture()
    const snapshot = finished(); snapshot.publicState.phase = 'PLAYING'
    client.store.setState({ snapshot })
    await client.act({ type: 'MOVE', dx: 1, dz: 0 }, true)
    await client.act({ type: 'MOVE', dx: 0, dz: 0 }, true)
    expect(request.mock.calls.map(([type]) => type)).toEqual(['GAME_ACTION_SEND', 'GAME_ACTION_SEND'])
    client.stop()
  })
  it('이전 이동 응답이 늦으면 대기 중인 방향을 최신 정지로 대체해 하나씩 전송한다', async () => {
    const { client, request } = fixture()
    const snapshot = finished(); snapshot.publicState.phase = 'PLAYING'
    client.store.setState({ snapshot })
    let acknowledge!: (value: Envelope) => void
    request.mockImplementationOnce(() => new Promise(resolve => { acknowledge = resolve }))
    const first = client.act({ type: 'MOVE', dx: 1, dz: 0 }, true)
    await Promise.resolve()
    const turn = client.act({ type: 'MOVE', dx: 0, dz: 1 }, true)
    const stop = client.act({ type: 'MOVE', dx: 0, dz: 0 }, true)
    await Promise.resolve()
    expect(request).toHaveBeenCalledTimes(1)
    acknowledge({ payload: {} } as Envelope)
    await Promise.all([first, turn, stop])
    expect(request.mock.calls.map(([, payload]) => payload.input)).toEqual([
      { type: 'MOVE', dx: 1, dz: 0 }, { type: 'MOVE', dx: 0, dz: 0 },
    ])
    client.stop()
  })
  it('정지 뒤에 도착한 이전 이동의 버전 오류는 낡은 방향을 재전송하지 않는다', async () => {
    const { client, request } = fixture()
    const snapshot = finished(); snapshot.publicState.phase = 'PLAYING'
    client.store.setState({ snapshot })
    let reject!: (reason: unknown) => void
    request.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail }))
    const first = client.act({ type: 'MOVE', dx: 1, dz: 0 }, true)
    await Promise.resolve()
    const stop = client.act({ type: 'MOVE', dx: 0, dz: 0 }, true)
    reject({ code: 'GAME_ACTION_STALE_VERSION' })
    await Promise.all([first, stop])
    expect(request.mock.calls.map(([type]) => type)).toEqual(['GAME_ACTION_SEND', 'GAME_ACTION_SEND'])
    expect(request.mock.calls[1][1].input).toEqual({ type: 'MOVE', dx: 0, dz: 0 })
    client.stop()
  })
  it('최신 방향의 버전 오류는 상태를 갱신한 뒤 같은 입력 ID로 재시도한다', async () => {
    const { client, request } = fixture()
    const snapshot = finished(); snapshot.publicState.phase = 'PLAYING'
    client.store.setState({ snapshot })
    request.mockRejectedValueOnce({ code: 'GAME_ACTION_STALE_VERSION' })
      .mockResolvedValueOnce({ type: 'GAME_STATE', payload: { ...snapshot, version: 21, publicState: { ...snapshot.publicState, actionVersion: 2 } } } as unknown as Envelope)
    await client.act({ type: 'MOVE', dx: -1, dz: 0 }, true)
    expect(request.mock.calls.map(([type]) => type)).toEqual(['GAME_ACTION_SEND', 'GAME_STATE_CHECK', 'GAME_ACTION_SEND'])
    expect(request.mock.calls[2][1]).toMatchObject({ actionId: request.mock.calls[0][1].actionId, expectedVersion: 2, input: { type: 'MOVE', dx: -1, dz: 0 } })
    client.stop()
  })
  it('이동 오류를 복구하는 동안 일시정지가 시작되면 방향을 다시 보내지 않는다', async () => {
    const { client, request } = fixture()
    const snapshot = finished(); snapshot.publicState.phase = 'PLAYING'
    client.store.setState({ snapshot })
    request.mockRejectedValueOnce({ code: 'GAME_ACTION_STALE_VERSION' })
      .mockResolvedValueOnce({ type: 'GAME_STATE', payload: { ...snapshot, version: 21, publicState: { ...snapshot.publicState, paused: true } } } as unknown as Envelope)
    await client.act({ type: 'MOVE', dx: -1, dz: 0 }, true)
    expect(request.mock.calls.map(([type]) => type)).toEqual(['GAME_ACTION_SEND', 'GAME_STATE_CHECK'])
    client.stop()
  })
})
