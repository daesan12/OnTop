import { describe, expect, it, vi } from 'vitest'
import { createBungeoppangService } from '../../src/features/bungeoppang/service'
import { RestError } from '../../src/network/restError'

const start = { minigameSessionId: '901', minigameType: 'BUNGEOPPANG', status: 'PLAYING', startedAt: '2026-10-24T01:00:00Z',
  rulesVersion: 'v2', heats: Array(64).fill(100), isFirstGame: true }
const result = { minigameSessionId: '901', status: 'COMPLETED', score: 86, made: 7, golden: 7, failed: 0, wasted: 0, maxCombo: 7,
  verifiedCompletedCount: 7, rewardAmount: 5, coinsCalculated: 5, coinsGranted: 5, todayEarned: 5, dailyCap: 1000, capReached: false }
describe('M14 existing REST adapter', () => {
  it('uses approved paths, same start key, exact body and the issued session identity', async () => {
    const request = vi.fn().mockResolvedValueOnce(start).mockResolvedValueOnce({ minigameSessionId: '901', status: 'PLAYING' })
      .mockResolvedValueOnce(result).mockResolvedValueOnce({ minigameSessionId: '901', status: 'ABANDONED', rewardAmount: 0 })
    const service = createBungeoppangService(request)
    expect(service.mock).toBe(false)
    expect((await service.startGame('same-start-key')).gameId).toBe('901')
    const init = request.mock.calls[0]![1] as RequestInit
    expect(init.headers).toEqual({ 'Content-Type': 'application/json', 'Idempotency-Key': 'same-start-key' })
    expect(JSON.parse(String(init.body))).toEqual({ minigameType: 'BUNGEOPPANG' })
    expect(request.mock.calls[1]![0]).toBe('/api/v1/minigames/sessions/901')
    expect(await service.submitResult({ gameId: '901', log: [], seenTips: [], clientScore: 0 })).toMatchObject({ score: 86, coinsGranted: 5 })
    expect(JSON.parse(String(request.mock.calls[2]![1].body))).toEqual({ log: [], seenTips: [], clientScore: 0 })
    await service.abandon('901')
    expect(request.mock.calls[3]![0]).toBe('/api/v1/minigames/sessions/901/abandon')
    expect(JSON.parse(String(request.mock.calls[3]![1].body))).toEqual({})
  })
  it.each(['LOG_INVALID', 'TOO_EARLY', 'MINIGAME_UNAVAILABLE', 'TOO_MANY_STARTS'])(
    'keeps BE %s and retry classification rather than replacing it with local success', async code => {
      const status = code === 'MINIGAME_UNAVAILABLE' ? 503 : code === 'TOO_MANY_STARTS' ? 429 : 422
      const service = createBungeoppangService(vi.fn().mockRejectedValue(new RestError(status, code, 'error')))
      await expect(service.submitResult({ gameId: '901', log: [], seenTips: [], clientScore: 999 }))
        .rejects.toMatchObject({ code, retryable: code !== 'LOG_INVALID' })
    })
  it('rejects a different or malformed session, heat list or reward response', async () => {
    for (const patch of [{ minigameSessionId: 'x' }, { heats: [100] }, { heats: Array(64).fill(116) }, { rulesVersion: 'v3' }]) {
      const service = createBungeoppangService(vi.fn().mockResolvedValue({ ...start, ...patch }))
      await expect(service.startGame('a')).rejects.toBeInstanceOf(Error)
    }
    for (const patch of [{ minigameSessionId: '902' }, { score: -1 }, { rewardAmount: 99 }, { coinsGranted: 101 }]) {
      const service = createBungeoppangService(vi.fn().mockResolvedValue({ ...result, ...patch }))
      await expect(service.submitResult({ gameId: '901', log: [], seenTips: [], clientScore: 0 })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
    }
  })
  it('checks an idempotent start receipt against the current server session before playing', async () => {
    const request = vi.fn().mockResolvedValueOnce(start).mockResolvedValueOnce({ minigameSessionId: '901', status: 'ABANDONED' })
    await expect(createBungeoppangService(request).startGame('old')).rejects.toMatchObject({ code: 'GAME_NOT_ACTIVE', retryable: false })
  })
  it('reads the real wallet and rejects inconsistent balances', async () => {
    const request = vi.fn().mockResolvedValueOnce({ balance: 105, reservedBalance: 5, availableBalance: 100 })
      .mockResolvedValueOnce({ balance: 105, reservedBalance: 5, availableBalance: 105 })
    const service = createBungeoppangService(request)
    expect(await service.balance()).toBe(105)
    expect(request.mock.calls[0]![0]).toBe('/api/v1/wallets/me')
    await expect(service.balance()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })
  it('distinguishes an uninitialized wallet from zero and never creates a wallet while reading', async () => {
    const request = vi.fn().mockRejectedValueOnce(new RestError(409, 'WALLET_NOT_READY', 'error'))
      .mockRejectedValueOnce(new RestError(503, 'WALLET_UNAVAILABLE', 'error'))
      .mockResolvedValueOnce({ balance: 0, reservedBalance: 0, availableBalance: 0 })
    const service = createBungeoppangService(request)
    await expect(service.balance()).rejects.toMatchObject({ code: 'WALLET_NOT_READY', retryable: false,
      message: expect.stringContaining('지갑 초기화') })
    await expect(service.balance()).rejects.toMatchObject({ code: 'WALLET_UNAVAILABLE', retryable: true })
    expect(await service.balance()).toBe(0)
    for (const [path, init] of request.mock.calls) {
      expect(path).toBe('/api/v1/wallets/me'); expect(init.method).toBeUndefined(); expect(init.body).toBeUndefined()
    }
  })
})
