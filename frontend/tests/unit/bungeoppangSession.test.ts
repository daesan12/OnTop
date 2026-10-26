import { afterEach, beforeEach, expect, it, vi } from 'vitest'
vi.mock('../../src/features/bungeoppang/access', () => ({ canOpenBungeoppang: vi.fn(() => true) }))
vi.mock('../../src/features/bungeoppang/service', async importOriginal => ({
  ...await importOriginal<typeof import('../../src/features/bungeoppang/service')>(),
  bungeoppangService: { getStatus: vi.fn(), startGame: vi.fn(), submitResult: vi.fn(), abandon: vi.fn(), balance: vi.fn() },
}))
import { canOpenBungeoppang } from '../../src/features/bungeoppang/access'
import { bungeoppangService as service, BungeoppangServiceError } from '../../src/features/bungeoppang/service'
import { advanceBungeoppangTime, escapeBungeoppang, leaveBungeoppang, openBungeoppang, pressBungeoppangSlot,
  quitBungeoppang, resetBungeoppang, refreshBungeoppangStatus, refreshBungeoppangWallet, setBungeoppangHelp, startBungeoppang, submitBungeoppang, useBungeoppang } from '../../src/features/bungeoppang/store'
import { inputState } from '../../src/world/inputOwnership'
import { bungeoppangClock, bungeoppangView } from '../../src/features/bungeoppang/bungeoppangView'
import { useSession } from '../../src/network/worldClient'

const game = { gameId: '901', startedAt: '2026-10-24T01:00:00Z', heats: Array(64).fill(100), rulesVersion: 'v2', isFirstGame: true }
const result = { score: 0, made: 0, golden: 0, failed: 0, wasted: 0, maxCombo: 0, coinsCalculated: 0, coinsGranted: 0, todayEarned: 0, dailyCap: 100, capReached: false }
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] })
  vi.stubGlobal('window', { dispatchEvent: vi.fn(), setTimeout })
  vi.stubGlobal('document', { activeElement: null, hidden: false, pointerLockElement: null })
  vi.stubGlobal('requestAnimationFrame', vi.fn().mockReturnValue(1)); vi.stubGlobal('cancelAnimationFrame', vi.fn())
  vi.mocked(canOpenBungeoppang).mockReturnValue(true)
  vi.mocked(service.getStatus).mockResolvedValue({ todayEarned: 0, dailyCap: 100, isFirstGame: true, seenTips: [], rulesVersion: 'v2' })
  vi.mocked(service.startGame).mockResolvedValue(game); vi.mocked(service.submitResult).mockResolvedValue(result)
  vi.mocked(service.abandon).mockResolvedValue(undefined); vi.mocked(service.balance).mockResolvedValue(100)
})
afterEach(() => { resetBungeoppang(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks() })
const enter = async () => { openBungeoppang(); await vi.advanceTimersByTimeAsync(800) }
it('does not enter when existing facilities, a match or current world ownership forbid it', () => {
  vi.mocked(canOpenBungeoppang).mockReturnValue(false); openBungeoppang()
  expect(useBungeoppang.getState().phase).toBe('idle'); expect(service.getStatus).not.toHaveBeenCalled()
})
it('retries a lost start with the same key; late start after leaving is abandoned', async () => {
  await enter()
  vi.mocked(service.startGame).mockRejectedValueOnce(new BungeoppangServiceError('NETWORK_ERROR', 'lost', true))
  await startBungeoppang(); await startBungeoppang()
  expect(service.startGame).toHaveBeenNthCalledWith(2, vi.mocked(service.startGame).mock.calls[0]![0])
  resetBungeoppang(); await enter()
  let finish!: (value: typeof game) => void
  vi.mocked(service.startGame).mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
  const pending = startBungeoppang(); leaveBungeoppang(); finish(game); await pending
  expect(service.abandon).toHaveBeenCalledWith('901')
  await vi.advanceTimersByTimeAsync(800); expect(inputState.minigameOpen).toBe(false)
})
it('uses wall time through hidden tabs/help and submits only once after the real duration', async () => {
  await enter(); await startBungeoppang(); await vi.advanceTimersByTimeAsync(3500)
  setBungeoppangHelp(true); pressBungeoppangSlot(0)
  expect(useBungeoppang.getState().grill?.log).toHaveLength(0)
  vi.stubGlobal('document', { activeElement: null, hidden: true })
  await vi.advanceTimersByTimeAsync(62000)
  expect(bungeoppangClock.t).toBe(60000); expect(useBungeoppang.getState().phase).toBe('result')
  expect(service.submitResult).toHaveBeenCalledTimes(1); expect(useBungeoppang.getState().result).toEqual(result)
  advanceBungeoppangTime(); expect(service.submitResult).toHaveBeenCalledTimes(1)
})
it('preserves a frozen submission on failure and prevents a new round before its result is known', async () => {
  await enter(); await startBungeoppang()
  vi.mocked(service.submitResult).mockRejectedValueOnce(new BungeoppangServiceError('NETWORK_ERROR', 'lost', true))
  await vi.advanceTimersByTimeAsync(65000)
  expect(useBungeoppang.getState().submitError?.retryable).toBe(true)
  await startBungeoppang(); expect(service.startGame).toHaveBeenCalledTimes(1)
  const first = vi.mocked(service.submitResult).mock.calls[0]![0]
  await submitBungeoppang(); expect(service.submitResult).toHaveBeenLastCalledWith(first)
  expect(vi.mocked(service.submitResult).mock.calls[1]![0]).toBe(first)
  expect(useBungeoppang.getState().result).toEqual(result)
})
it('retains the cooking screen on rejected abandon, then exits only after approval', async () => {
  await enter(); await startBungeoppang(); escapeBungeoppang()
  vi.mocked(service.abandon).mockRejectedValueOnce(new Error('unavailable'))
  await quitBungeoppang(); expect(useBungeoppang.getState()).toMatchObject({ phase: 'countdown', confirmExit: true, abandonError: 'unavailable' })
  await quitBungeoppang(); expect(useBungeoppang.getState().phase).toBe('idle')
  expect(inputState.minigameOpen).toBe(false)
  expect(bungeoppangView.returningUntil).toBeGreaterThan(performance.now())
  setBungeoppangHelp(true); expect(inputState.manualOpen).toBe(false)
  await vi.advanceTimersByTimeAsync(800); expect(useBungeoppang.getState().phase).toBe('idle')
  expect(inputState.minigameOpen).toBe(false)
  setBungeoppangHelp(true); expect(inputState.manualOpen).toBe(false)
})
it('restores controls immediately and a previous exit cannot close a reopened visit', async () => {
  await enter()
  leaveBungeoppang()
  expect(useBungeoppang.getState().phase).toBe('idle')
  expect(inputState.minigameOpen).toBe(false)
  openBungeoppang()
  await vi.advanceTimersByTimeAsync(800)
  expect(useBungeoppang.getState().phase).toBe('start')
  expect(inputState.minigameOpen).toBe(true)
  resetBungeoppang()
  expect(bungeoppangView.returningUntil).toBe(0)
})
it('isolates late result and status replies from another visit', async () => {
  await enter(); await startBungeoppang()
  let finish!: (value: typeof result) => void
  vi.mocked(service.submitResult).mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
  await vi.advanceTimersByTimeAsync(65000)
  resetBungeoppang(); await enter(); finish({ ...result, score: 100, coinsGranted: 6 })
  await Promise.resolve(); expect(useBungeoppang.getState().result).toBeNull()
  expect(useBungeoppang.getState().gameId).toBe('')
})
it('rechecks the wallet with status retry and shows the initialization error without inventing a balance', async () => {
  useSession.setState({ sessionId: '101', account: { nickname: 'test', balance: null } })
  vi.mocked(service.balance).mockRejectedValueOnce(new BungeoppangServiceError('WALLET_NOT_READY', '지갑 초기화가 필요합니다.'))
  await enter()
  expect(useBungeoppang.getState().walletError).toContain('지갑 초기화')
  expect(useSession.getState().account?.balance).toBeNull()
  await refreshBungeoppangStatus(); await Promise.resolve()
  expect(useBungeoppang.getState().walletError).toBeNull()
  expect(useSession.getState().account?.balance).toBe(100)
  expect(service.balance).toHaveBeenCalledTimes(2)
})
it('retries only the balance after settlement and ignores an older in-flight wallet response', async () => {
  useSession.setState({ sessionId: '101', account: { nickname: 'test', balance: 100 } })
  await enter(); await startBungeoppang()
  let old!: (value: number) => void
  vi.mocked(service.balance).mockReturnValueOnce(new Promise(resolve => { old = resolve }))
    .mockResolvedValueOnce(105)
  const pending = refreshBungeoppangWallet()
  await refreshBungeoppangWallet()
  old(100); await pending
  expect(useSession.getState().account?.balance).toBe(105)
  expect(service.submitResult).not.toHaveBeenCalled()
  resetBungeoppang(); await refreshBungeoppangWallet()
  expect(service.balance).toHaveBeenCalledTimes(3)
})
