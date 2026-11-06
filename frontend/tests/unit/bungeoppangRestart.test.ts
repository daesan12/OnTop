import { afterEach, beforeEach, expect, it, vi } from 'vitest'
vi.mock('../../src/features/bungeoppang/service', async original => ({
  ...await original<typeof import('../../src/features/bungeoppang/service')>(),
  bungeoppangService: { mock: false, getStatus: vi.fn(), resumeGame: vi.fn(), startGame: vi.fn(),
    submitResult: vi.fn(), abandon: vi.fn(), balance: vi.fn(), nextOrder: vi.fn() },
}))
import { bungeoppangService as service, BungeoppangServiceError, type BungeoppangGame } from '../../src/features/bungeoppang/service'
import { continueBungeoppang, escapeBungeoppang, quitBungeoppang, resetBungeoppang, restartBungeoppang, restoreBungeoppang,
  startBungeoppang, useBungeoppang, watchBungeoppangRecovery } from '../../src/features/bungeoppang/store'
import { useSession } from '../../src/network/worldClient'
import { inputState } from '../../src/world/inputOwnership'
import { bungeoppangClock as clock, bungeoppangView as view } from '../../src/features/bungeoppang/bungeoppangView'
import { BUNGEOPPANG_V4 as rules } from '../../src/features/bungeoppang/config'
import { createGrill, applyAction } from '../../src/features/bungeoppang/rulesV4'

const epoch = Date.parse('2026-11-05T00:00:00Z'), iso = (n: number) => new Date(epoch + n).toISOString()
const timing = { countdownStartsAt: iso(1000), playStartsAt: iso(4500), playEndsAt: iso(64500),
  submitDeadline: iso(79500), expiresAt: iso(89500) }
const status = { activeSessionId: '901', rulesVersion: 'v4', todayEarned: 120, dailyCap: 500, isFirstGame: false, seenTips: [] }
const order = { orderId: '1', orderIndex: 0, items: { bean: 2, custard: 0, pizza: 0, chocolate: 0 } }
/** 진행 중인 판(901): 철판에 반죽이 들어가 있고 서버 시각으로 15.5초 진행. */
function running(): BungeoppangGame {
  const grill = applyAction(createGrill(Array(512).fill(100), order, rules), { action: 'POUR', slot: 0, t: 0 }, rules).state
  return { gameId: '901', startedAt: iso(4500), rulesVersion: 'v4', isFirstGame: false, heats: Array(512).fill(100),
    v4: { rules, order: grill.order!, grill, timing,
      timeSync: { status: 'PLAYING', timing, sample: { serverNowMs: epoch + 20000, receivedAt: 0, rttMs: 0 } } } }
}
/** 새로 시작한 판(902): 서버 시각이 카운트다운 구간. */
function fresh(gameId = '902'): BungeoppangGame {
  return { gameId, startedAt: iso(4500), rulesVersion: 'v4', isFirstGame: false, heats: Array(512).fill(100),
    v4: { rules, order: { items: order.items }, timing,
      timeSync: { status: 'PLAYING', timing, sample: { serverNowMs: epoch + 2000, receivedAt: performance.now(), rttMs: 0 } } } }
}
const deferred = <T,>() => {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void
  const promise = new Promise<T>((ok, fail) => { resolve = ok; reject = fail })
  return { promise, resolve, reject }
}
const state = () => useBungeoppang.getState()
async function playing() {
  await restoreBungeoppang()
  expect(state()).toMatchObject({ phase: 'play', gameId: '901' })
  escapeBungeoppang(); expect(state().confirmExit).toBe(true)
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'performance', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
  vi.stubGlobal('window', { dispatchEvent: vi.fn(), setTimeout, addEventListener: vi.fn(), removeEventListener: vi.fn() })
  vi.stubGlobal('document', { activeElement: null, hidden: false, pointerLockElement: null, addEventListener: vi.fn(), removeEventListener: vi.fn() })
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1)); vi.stubGlobal('cancelAnimationFrame', vi.fn())
  useSession.setState({ status: 'connected', sessionId: '101', roomId: 'one', mapCompatible: true, pending: false,
    activities: { '101': 'BUNGEOPPANG' } })
  vi.mocked(service.getStatus).mockResolvedValue(status)
  vi.mocked(service.resumeGame!).mockResolvedValue(running())
  vi.mocked(service.startGame).mockImplementation(async () => fresh())
  vi.mocked(service.balance).mockResolvedValue(100)
  vi.mocked(service.abandon).mockResolvedValue(undefined)
})
afterEach(() => {
  resetBungeoppang(); useSession.setState({ status: 'idle', sessionId: '', roomId: '', activities: {} })
  vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks()
})

it('abandons first, then starts a fresh round in countdown without passing through idle or the start guide', async () => {
  await playing()
  const phases: string[] = []
  const stop = useBungeoppang.subscribe(s => { phases.push(s.restarting && s.phase === 'start' ? 'restarting' : s.phase) })
  await restartBungeoppang(); stop()
  expect(service.abandon).toHaveBeenCalledExactlyOnceWith('901')
  expect(service.startGame).toHaveBeenCalledTimes(1)
  expect(vi.mocked(service.abandon).mock.invocationCallOrder[0]!).toBeLessThan(vi.mocked(service.startGame).mock.invocationCallOrder[0]!)
  expect(phases).not.toContain('idle')
  expect(phases.filter(phase => phase === 'start')).toEqual([])
  expect(state()).toMatchObject({ phase: 'countdown', gameId: '902', restarting: false, abandonPending: false, starting: false,
    confirmExit: false, tool: 'batter', popups: [], feedback: [], result: null, submitError: null, abandonError: null })
  // 이전 판의 철판·조리 기록·점수와 시계를 이어받지 않는다.
  expect(state().grill?.log).toEqual([]); expect(state().grill?.score).toBe(0)
  expect(clock.t).toBe(0); expect(clock.countdown).toBeGreaterThan(0)
  // 화면·카메라·입력 소유권은 공원으로 돌아가지 않는다. 포기한 판은 정산하지 않는다.
  expect(inputState.minigameOpen).toBe(true); expect(view.active).toBe(true)
  expect(service.submitResult).not.toHaveBeenCalled()
  expect(state().status?.todayEarned).toBe(120)
})

it('shows only a preparing state while the new start is in flight and ignores repeated clicks and ESC', async () => {
  await playing()
  const abandon = deferred<void>(), start = deferred<BungeoppangGame>()
  vi.mocked(service.abandon).mockReturnValueOnce(abandon.promise)
  vi.mocked(service.startGame).mockReturnValueOnce(start.promise)
  const pending = restartBungeoppang()
  void restartBungeoppang(); void quitBungeoppang(); escapeBungeoppang(); continueBungeoppang()
  expect(state()).toMatchObject({ abandonPending: true, restarting: true, confirmExit: true, phase: 'play' })
  expect(service.startGame).not.toHaveBeenCalled()
  abandon.resolve(); await vi.advanceTimersByTimeAsync(0)
  expect(state()).toMatchObject({ phase: 'start', restarting: true, starting: true, gameId: '', grill: null })
  void restartBungeoppang(); escapeBungeoppang(); void startBungeoppang()
  expect(state().phase).toBe('start')
  start.resolve(fresh()); await pending
  expect(service.abandon).toHaveBeenCalledTimes(1); expect(service.startGame).toHaveBeenCalledTimes(1)
  expect(state()).toMatchObject({ phase: 'countdown', gameId: '902', restarting: false })
})

it('keeps the round and dialog when abandon fails, never starts, and the same button retries', async () => {
  await playing()
  vi.mocked(service.abandon).mockRejectedValueOnce(new BungeoppangServiceError('NETWORK_ERROR', '서버 응답을 받지 못했어요.', true))
  await restartBungeoppang()
  expect(service.startGame).not.toHaveBeenCalled()
  expect(state()).toMatchObject({ phase: 'play', gameId: '901', confirmExit: true, restarting: false, abandonPending: false,
    abandonError: '서버 응답을 받지 못했어요.' })
  expect(state().grill?.log).toHaveLength(1)
  await restartBungeoppang()
  expect(service.abandon).toHaveBeenCalledTimes(2)
  expect(state()).toMatchObject({ phase: 'countdown', gameId: '902', abandonError: null })
})

it('starts a new round when the server says the old round is already invalid', async () => {
  await playing()
  vi.mocked(service.abandon).mockRejectedValueOnce(new BungeoppangServiceError('MINIGAME_ALREADY_INVALID', '이미 종료된 판이에요.', false))
  await restartBungeoppang()
  expect(service.startGame).toHaveBeenCalledTimes(1)
  expect(state()).toMatchObject({ phase: 'countdown', gameId: '902' })
})

it('does not start a new round over an already completed round', async () => {
  await playing()
  vi.mocked(service.abandon).mockRejectedValueOnce(new BungeoppangServiceError('MINIGAME_ALREADY_COMPLETED', '이미 보상이 확정된 미니게임입니다.', false))
  await restartBungeoppang()
  expect(service.startGame).not.toHaveBeenCalled()
  expect(state()).toMatchObject({ gameId: '901', confirmExit: true, restarting: false })
  expect(state().abandonError).toContain('이미 정산이 끝난 판')
})

it('lands on the start guide with the error after a failed start, retries with the same key, and can still leave', async () => {
  await playing()
  vi.mocked(service.startGame).mockRejectedValueOnce(new BungeoppangServiceError('TOO_MANY_STARTS', '시작 요청이 많아요. 잠시 후 다시 시도해 주세요.', true))
  await restartBungeoppang()
  expect(state()).toMatchObject({ phase: 'start', restarting: false, recovering: false, gameId: '', grill: null,
    startError: '시작 요청이 많아요. 잠시 후 다시 시도해 주세요.' })
  const key = vi.mocked(service.startGame).mock.calls[0]![0]
  await startBungeoppang()
  expect(service.startGame).toHaveBeenLastCalledWith(key)
  expect(state()).toMatchObject({ phase: 'countdown', gameId: '902' })

  vi.mocked(service.startGame).mockRejectedValueOnce(new BungeoppangServiceError('NETWORK_ERROR', 'lost', true))
  escapeBungeoppang(); await restartBungeoppang()
  expect(state().phase).toBe('start')
  escapeBungeoppang()
  expect(state().phase).toBe('idle'); expect(inputState.minigameOpen).toBe(false)
})

it('a round that ends while abandon is pending is still abandoned, never settled, then restarted', async () => {
  await playing()
  const abandon = deferred<void>()
  vi.mocked(service.abandon).mockReturnValueOnce(abandon.promise)
  const pending = restartBungeoppang()
  await vi.advanceTimersByTimeAsync(52000)
  expect(['ending', 'result']).toContain(state().phase)
  expect(service.submitResult).not.toHaveBeenCalled()
  abandon.resolve(); await pending
  expect(service.submitResult).not.toHaveBeenCalled()
  expect(state()).toMatchObject({ phase: 'countdown', gameId: '902' })
})

it('settles normally when abandon fails after the round has already ended', async () => {
  await playing()
  const abandon = deferred<void>()
  vi.mocked(service.abandon).mockReturnValueOnce(abandon.promise)
  vi.mocked(service.submitResult).mockReturnValue(new Promise(() => {}))
  const pending = restartBungeoppang()
  await vi.advanceTimersByTimeAsync(52000)
  abandon.reject(new Error('unavailable')); await pending
  expect(service.startGame).not.toHaveBeenCalled()
  expect(service.submitResult).toHaveBeenCalledTimes(1)
})

it('keeps continue and quit unchanged', async () => {
  await playing()
  continueBungeoppang()
  expect(state()).toMatchObject({ phase: 'play', gameId: '901', confirmExit: false })
  escapeBungeoppang(); await quitBungeoppang()
  expect(service.abandon).toHaveBeenCalledExactlyOnceWith('901'); expect(service.startGame).not.toHaveBeenCalled()
  expect(state().phase).toBe('idle'); expect(inputState.minigameOpen).toBe(false)
})

it('Story 204: the activity flip during restart does not trigger recovery; reload after start resumes the new round', async () => {
  const stop = watchBungeoppangRecovery()
  await vi.advanceTimersByTimeAsync(0)
  expect(state()).toMatchObject({ phase: 'play', gameId: '901' })
  escapeBungeoppang()
  const start = deferred<BungeoppangGame>()
  vi.mocked(service.startGame).mockReturnValueOnce(start.promise)
  const pending = restartBungeoppang()
  // abandon 커밋 → 활동 종료 방송, start 커밋 → 활동 시작 방송
  useSession.setState({ activities: {} }); await vi.advanceTimersByTimeAsync(0)
  useSession.setState({ activities: { '101': 'BUNGEOPPANG' } }); await vi.advanceTimersByTimeAsync(0)
  start.resolve(fresh()); await pending
  expect(service.resumeGame).toHaveBeenCalledTimes(1)
  expect(state()).toMatchObject({ phase: 'countdown', gameId: '902' })
  stop()

  // 새로고침: 서버의 활성 판은 새 판(902)이므로 기존 복구가 그 판을 이어받는다.
  vi.mocked(service.getStatus).mockResolvedValue({ ...status, activeSessionId: '902' })
  vi.mocked(service.resumeGame!).mockResolvedValueOnce(fresh())
  await restoreBungeoppang()
  expect(service.resumeGame).toHaveBeenLastCalledWith('902')
  expect(state()).toMatchObject({ gameId: '902', recovering: false })
})

it('a disconnect during restart discards the late start reply and abandons that orphan round', async () => {
  await playing()
  const start = deferred<BungeoppangGame>()
  vi.mocked(service.startGame).mockReturnValueOnce(start.promise)
  const pending = restartBungeoppang(); await vi.advanceTimersByTimeAsync(0)
  resetBungeoppang()
  start.resolve(fresh()); await pending
  expect(service.abandon).toHaveBeenLastCalledWith('902')
  expect(state()).toMatchObject({ phase: 'idle', gameId: '', restarting: false })
})

it('a reload after abandon but before start does not resume the abandoned round', async () => {
  await playing()
  const start = deferred<BungeoppangGame>()
  vi.mocked(service.startGame).mockReturnValueOnce(start.promise)
  void restartBungeoppang(); await vi.advanceTimersByTimeAsync(0)
  resetBungeoppang(); useSession.setState({ activities: {} })
  vi.mocked(service.getStatus).mockResolvedValue({ ...status, activeSessionId: null })
  const stop = watchBungeoppangRecovery(); await vi.advanceTimersByTimeAsync(0)
  expect(state().phase).toBe('idle'); expect(service.resumeGame).toHaveBeenCalledTimes(1)
  stop()
})
