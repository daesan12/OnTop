import { afterEach, beforeEach, expect, it, vi } from 'vitest'
vi.mock('../../src/features/bungeoppang/service', async original => ({
  ...await original<typeof import('../../src/features/bungeoppang/service')>(),
  bungeoppangService: { mock: false, getStatus: vi.fn(), resumeGame: vi.fn(), startGame: vi.fn(),
    submitResult: vi.fn(), abandon: vi.fn(), balance: vi.fn(), nextOrder: vi.fn() },
}))
import { bungeoppangService as service, BungeoppangServiceError, type BungeoppangGame } from '../../src/features/bungeoppang/service'
import { restoreBungeoppang, watchBungeoppangRecovery, resetBungeoppang, useBungeoppang, escapeBungeoppang, quitBungeoppang, dismissBungeoppangRecovery } from '../../src/features/bungeoppang/store'
import { useSession } from '../../src/network/worldClient'
import { inputState } from '../../src/world/inputOwnership'
import { bungeoppangClock as clock, bungeoppangView as view } from '../../src/features/bungeoppang/bungeoppangView'
import { BUNGEOPPANG_V4 as rules } from '../../src/features/bungeoppang/config'
import { createGrill, applyAction } from '../../src/features/bungeoppang/rulesV4'

const epoch = Date.parse('2026-11-05T00:00:00Z'), iso = (n: number) => new Date(epoch + n).toISOString()
const timing = { countdownStartsAt: iso(1000), playStartsAt: iso(4500), playEndsAt: iso(64500),
  submitDeadline: iso(79500), expiresAt: iso(89500) }
const status = { activeSessionId: '901', rulesVersion: 'v4', todayEarned: 0, dailyCap: 500, isFirstGame: false, seenTips: [] }
function game(): BungeoppangGame {
  let grill = createGrill(Array(512).fill(100), { orderId: '1', orderIndex: 0, items: { bean: 2, custard: 0, pizza: 0, chocolate: 0 } }, rules)
  grill = applyAction(grill, { action: 'POUR', slot: 0, t: 0 }, rules).state
  return { gameId: '901', startedAt: iso(4500), rulesVersion: 'v4', isFirstGame: false, heats: Array(512).fill(100),
    v4: { rules, order: grill.order!, grill, timing,
      timeSync: { status: 'PLAYING', timing, sample: { serverNowMs: epoch + 20000, receivedAt: 0, rttMs: 0 } } } }
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'performance', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
  vi.stubGlobal('window', { dispatchEvent: vi.fn(), setTimeout, addEventListener: vi.fn(), removeEventListener: vi.fn() })
  vi.stubGlobal('document', { activeElement: null, hidden: false, pointerLockElement: null, addEventListener: vi.fn(), removeEventListener: vi.fn() })
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1)); vi.stubGlobal('cancelAnimationFrame', vi.fn())
  useSession.setState({ status: 'connected', sessionId: '101', roomId: 'one', mapCompatible: true, pending: false,
    activities: { '101': 'BUNGEOPPANG' } })
  vi.mocked(service.getStatus).mockResolvedValue(status)
  vi.mocked(service.resumeGame!).mockResolvedValue(game())
  vi.mocked(service.balance).mockResolvedValue(100)
  vi.mocked(service.abandon).mockResolvedValue(undefined)
})
afterEach(() => {
  resetBungeoppang(); useSession.setState({ status: 'idle', sessionId: '', roomId: '', activities: {} })
  vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks()
})
it('restores the existing approved grill and remaining server time instead of leaving a frozen lobby avatar', async () => {
  expect(useBungeoppang.getState().phase).toBe('idle')
  await restoreBungeoppang()
  expect(useBungeoppang.getState()).toMatchObject({ phase: 'play', gameId: '901', recovering: false, starting: false })
  expect(useBungeoppang.getState().grill?.log).toEqual([{ action: 'POUR', slot: 0, t: 0 }])
  expect(clock.t).toBe(15500)
  expect(inputState.minigameOpen).toBe(true); expect(view.active).toBe(true)
  expect(service.resumeGame).toHaveBeenCalledExactlyOnceWith('901')
  expect(service.startGame).not.toHaveBeenCalled(); expect(service.abandon).not.toHaveBeenCalled()
})
it('does not start recovery for another user or before map/channel admission', async () => {
  useSession.setState({ activities: { '202': 'BUNGEOPPANG' } }); await restoreBungeoppang()
  useSession.setState({ activities: { '101': 'BUNGEOPPANG' }, mapCompatible: false }); await restoreBungeoppang()
  expect(service.getStatus).not.toHaveBeenCalled(); expect(useBungeoppang.getState().phase).toBe('idle')
})
it('does not open another recovery on repeated world snapshots or while the first GET is pending', async () => {
  let resolve!: (value: BungeoppangGame) => void
  vi.mocked(service.resumeGame!).mockReturnValueOnce(new Promise(r => { resolve = r }))
  const pending = restoreBungeoppang(); await Promise.resolve(); await restoreBungeoppang()
  resolve(game()); await pending; await restoreBungeoppang()
  expect(service.getStatus).toHaveBeenCalledTimes(1)
})
it('drops a late recovery after disconnect without abandoning the actual running round', async () => {
  let resolve!: (value: BungeoppangGame) => void
  vi.mocked(service.resumeGame!).mockReturnValueOnce(new Promise(r => { resolve = r }))
  const pending = restoreBungeoppang(); await Promise.resolve()
  resetBungeoppang(); useSession.setState({ status: 'reconnecting' }); resolve(game()); await pending
  expect(useBungeoppang.getState().phase).toBe('idle'); expect(inputState.minigameOpen).toBe(false)
  expect(service.abandon).not.toHaveBeenCalled()
})
it('returns to roaming if the fresh lobby GET says no round is active', async () => {
  vi.mocked(service.getStatus).mockResolvedValueOnce({ ...status, activeSessionId: null })
  await restoreBungeoppang()
  expect(useBungeoppang.getState().phase).toBe('idle'); expect(inputState.minigameOpen).toBe(false)
  expect(service.resumeGame).not.toHaveBeenCalled()
})
it('keeps an explicit retry/quit state on failure and abandons only after user confirmation', async () => {
  vi.mocked(service.resumeGame!).mockRejectedValueOnce(new Error('일시적인 연결 실패'))
  await restoreBungeoppang()
  expect(useBungeoppang.getState()).toMatchObject({ phase: 'start', recovering: true, gameId: '901', starting: false, startError: '일시적인 연결 실패' })
  escapeBungeoppang(); expect(useBungeoppang.getState().confirmExit).toBe(true)
  await quitBungeoppang()
  expect(service.abandon).toHaveBeenCalledExactlyOnceWith('901')
  expect(useBungeoppang.getState().phase).toBe('idle'); expect(inputState.minigameOpen).toBe(false)
})
it('does not retry a failed automatic recovery on every world snapshot and still permits one explicit retry', async () => {
  vi.mocked(service.resumeGame!).mockRejectedValueOnce(new Error('일시적인 연결 실패'))
  const stop = watchBungeoppangRecovery()
  try {
    await vi.advanceTimersByTimeAsync(0)
    expect(useBungeoppang.getState().starting).toBe(false)
    for (let frame = 0; frame < 30; frame++) useSession.setState({ playerCount: frame })
    await vi.advanceTimersByTimeAsync(0)
    expect(service.getStatus).toHaveBeenCalledTimes(1)
    expect(service.resumeGame).toHaveBeenCalledTimes(1)
    await restoreBungeoppang()
    expect(service.resumeGame).toHaveBeenCalledTimes(2)
    expect(useBungeoppang.getState().phase).toBe('play')
  } finally { stop() }
})
it('shows a terminal explanation instead of retrying or creating another round', async () => {
  vi.mocked(service.resumeGame!).mockRejectedValueOnce(new BungeoppangServiceError('GAME_NOT_ACTIVE', '만료된 판'))
  await restoreBungeoppang()
  expect(useBungeoppang.getState()).toMatchObject({ phase: 'result', recovering: false, submitError: { retryable: false } })
  escapeBungeoppang(); expect(inputState.minigameOpen).toBe(false)
  expect(service.startGame).not.toHaveBeenCalled(); expect(service.submitResult).not.toHaveBeenCalled()
})

it('lets an initial lookup failure leave the overlay while preserving an explicit pending recovery', async () => {
  vi.mocked(service.getStatus).mockRejectedValueOnce(new Error('로비 조회 실패'))
  const stop = watchBungeoppangRecovery()
  try {
    await vi.advanceTimersByTimeAsync(0)
    expect(useBungeoppang.getState()).toMatchObject({ phase: 'start', gameId: '', starting: false })
    escapeBungeoppang()
    expect(useBungeoppang.getState()).toMatchObject({ phase: 'idle', recovering: true, recoveryDeferred: true })
    expect(inputState.minigameOpen).toBe(false); expect(view.active).toBe(false)
    expect(useSession.getState().activities['101']).toBe('BUNGEOPPANG')
    for (let i = 0; i < 30; i++) useSession.setState({ playerCount: i })
    expect(service.getStatus).toHaveBeenCalledTimes(1)
    expect(service.abandon).not.toHaveBeenCalled()
    await restoreBungeoppang()
    expect(useBungeoppang.getState()).toMatchObject({ phase: 'play', recoveryDeferred: false })
    expect(view.active).toBe(true); expect(inputState.minigameOpen).toBe(true)
  } finally { stop() }
})

it('clears a dismissed recovery notice when the server activity ends', async () => {
  vi.mocked(service.getStatus).mockRejectedValueOnce(new Error('로비 조회 실패'))
  const stop = watchBungeoppangRecovery()
  try {
    await vi.advanceTimersByTimeAsync(0); dismissBungeoppangRecovery()
    view.returningUntil = 0 // The camera easing can finish before the server activity expires.
    useSession.setState({ activities: {} })
    expect(useBungeoppang.getState()).toMatchObject({ phase: 'idle', recoveryDeferred: false, recovering: false })
    expect(service.abandon).not.toHaveBeenCalled()
  } finally { stop() }
})

it('does not dismiss an in-flight lookup or a known round without its abandon ACK', async () => {
  let resolve!: (value: typeof status) => void
  vi.mocked(service.getStatus).mockReturnValueOnce(new Promise(r => { resolve = r }))
  const pending = restoreBungeoppang()
  escapeBungeoppang(); dismissBungeoppangRecovery()
  expect(useBungeoppang.getState()).toMatchObject({ phase: 'start', starting: true, recoveryDeferred: false })
  resolve(status); await pending
  expect(useBungeoppang.getState().phase).toBe('play')
})
