import { afterEach, describe, expect, it, vi } from 'vitest'
import { CoopClient } from '../../src/features/skewer/coop/client'
import type { CoopSnapshot, CoopTransport } from '../../src/features/skewer/coop/contracts'
import { refreshWalletAfterSettlement } from '../../src/features/wallet/settlementRefresh'
import type { Envelope } from '../../src/network/protocol'

vi.mock('../../src/features/wallet/settlementRefresh', () => ({ refreshWalletAfterSettlement: vi.fn() }))
const id = 'skewer-coop-00000000-0000-4000-8000-000000000001'
const finished = (): CoopSnapshot => ({ gameId: id, version: 20, registered: true, privateState: { role: '' },
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
})
