import { afterEach, beforeEach, expect, it, vi } from 'vitest'
vi.mock('../../src/features/bungeoppang/access', () => ({ canOpenBungeoppang: vi.fn(() => true) }))
vi.mock('../../src/features/bungeoppang/service', async importOriginal => ({
  ...await importOriginal<typeof import('../../src/features/bungeoppang/service')>(),
  bungeoppangService: { getStatus: vi.fn(), startGame: vi.fn(), submitResult: vi.fn(), abandon: vi.fn(), balance: vi.fn(), nextOrder: vi.fn(), recoverV4: vi.fn() },
}))
import { canOpenBungeoppang } from '../../src/features/bungeoppang/access'
import { bungeoppangService as service, BungeoppangServiceError } from '../../src/features/bungeoppang/service'
import { advanceBungeoppangTime, escapeBungeoppang, leaveBungeoppang, openBungeoppang, pressBungeoppangSlot,
  deliverBungeoppangOrder, discardBungeoppangTray, discardBungeoppangSlot, requestBungeoppangOrder, isV4Grill, setBungeoppangTool,
  quitBungeoppang, resetBungeoppang, refreshBungeoppangStatus, refreshBungeoppangWallet, setBungeoppangHelp, startBungeoppang, submitBungeoppang, useBungeoppang } from '../../src/features/bungeoppang/store'
import { inputState } from '../../src/world/inputOwnership'
import { bungeoppangClock } from '../../src/features/bungeoppang/bungeoppangView'
import { useSession } from '../../src/network/worldClient'
import { BUNGEOPPANG_V4 as V4 } from '../../src/features/bungeoppang/config'
import { createGrill as createV4Grill } from '../../src/features/bungeoppang/rulesV4'

const game = { gameId: '901', startedAt: '2026-10-24T01:00:00Z', heats: Array(64).fill(100), rulesVersion: 'v2', isFirstGame: true }
const result = { score: 0, made: 0, golden: 0, failed: 0, wasted: 0, maxCombo: 0, coinsCalculated: 0, coinsGranted: 0, todayEarned: 0, dailyCap: 100, capReached: false }
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] })
  vi.stubGlobal('window', { dispatchEvent: vi.fn(), setTimeout, innerWidth: 1280, innerHeight: 720 })
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
  await quitBungeoppang(); expect(useBungeoppang.getState().phase).toBe('leaving')
  setBungeoppangHelp(true); expect(inputState.manualOpen).toBe(false)
  await vi.advanceTimersByTimeAsync(800); expect(useBungeoppang.getState().phase).toBe('idle')
  expect(inputState.minigameOpen).toBe(false)
  setBungeoppangHelp(true); expect(inputState.manualOpen).toBe(false)
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

const firstOrder = { items: { bean: 2, custard: 0, pizza: 0, chocolate: 0 } };
async function enterV4() {
  vi.mocked(service.getStatus).mockResolvedValue({ todayEarned: 0, dailyCap: 100, isFirstGame: true, seenTips: [], rulesVersion: 'v4' });
  vi.mocked(service.startGame).mockResolvedValue({ ...game, rulesVersion: 'v4', v4: { order: firstOrder, rules: V4 } });
  await enter(); await startBungeoppang(); await vi.advanceTimersByTimeAsync(3500);
  const grill = useBungeoppang.getState().grill!;
  if (!isV4Grill(grill)) throw new Error('Expected v4');
  useBungeoppang.setState({ grill: { ...grill, tray: [1, 2].map(id => ({ id, filling: 'bean', front: 80, back: 80, points: 10 })) } });
}
it('v4 freezes a delivery retry, allows cooking while awaiting next order and ignores a late response after leaving', async () => {
  await enterV4();
  let reply!: (value: { index: number; order: typeof firstOrder }) => void;
  vi.mocked(service.nextOrder!).mockReturnValueOnce(new Promise(resolve => { reply = resolve }));
  deliverBungeoppangOrder(); deliverBungeoppangOrder();
  expect(service.nextOrder).toHaveBeenCalledTimes(1);
  expect(useBungeoppang.getState().orderPending).toBe(true);
  await vi.advanceTimersByTimeAsync(100); pressBungeoppangSlot(2);
  expect(useBungeoppang.getState().grill!.slots[2]!.phase).toBe('batter');
  resetBungeoppang(); await enter();
  reply({ index: 1, order: firstOrder }); await Promise.resolve();
  expect(useBungeoppang.getState().grill).toBeNull(); expect(useBungeoppang.getState().orderPending).toBe(false);
});
it('v4 retry uses the exact delivery prefix after additional cooking and supplies only its next order', async () => {
  await enterV4();
  vi.mocked(service.nextOrder!).mockRejectedValueOnce(new Error('lost')).mockResolvedValueOnce({ index: 1, order: firstOrder });
  deliverBungeoppangOrder(); await Promise.resolve();
  expect(useBungeoppang.getState().orderError).toBe('lost');
  const frozen = vi.mocked(service.nextOrder!).mock.calls[0]![0];
  await vi.advanceTimersByTimeAsync(100); pressBungeoppangSlot(2);
  await requestBungeoppangOrder();
  expect(vi.mocked(service.nextOrder!).mock.calls[1]![0]).toBe(frozen);
  const grill = useBungeoppang.getState().grill!;
  expect(grill).toMatchObject({ orderIndex: 1, order: firstOrder, score: 20 });
  expect(grill.slots[2]!.phase).toBe('batter');
});
it('v4 distinguishes an explicit rejection, restores the checkpoint and replays legal post-request cooking', async () => {
  await enterV4();
  let reject!: (reason: Error) => void;
  vi.mocked(service.nextOrder!).mockReturnValueOnce(new Promise((_, fail) => { reject = fail }));
  const recovered = createV4Grill(Array(V4.heatListLength).fill(100), { ...firstOrder, orderId: '1', orderIndex: 0 }, V4);
  vi.mocked(service.recoverV4!).mockResolvedValue({ grill: recovered, checkpoint: {} as never });
  deliverBungeoppangOrder();
  await vi.advanceTimersByTimeAsync(100); pressBungeoppangSlot(2);
  reject(new BungeoppangServiceError('DELIVERY_REJECTED', 'rejected', false, 422));
  await Promise.resolve(); await Promise.resolve();
  expect(service.recoverV4).toHaveBeenCalledWith('901');
  expect(useBungeoppang.getState()).toMatchObject({ orderPending: false, orderError: null });
  const grill = useBungeoppang.getState().grill!;
  expect(grill).toMatchObject({ score: 0, orderIndex: 0, order: firstOrder });
  expect(grill.slots[2]!.phase).toBe('batter');
});
it('v4 blocked controls consume no heat, help/confirm time still ends, and settlement retries keep one log', async () => {
  await enterV4();
  setBungeoppangHelp(true); setBungeoppangTool('chocolate'); pressBungeoppangSlot(0); deliverBungeoppangOrder();
  expect(useBungeoppang.getState().grill!.log).toHaveLength(0);
  setBungeoppangHelp(false); escapeBungeoppang();
  vi.mocked(service.submitResult).mockRejectedValueOnce(new BungeoppangServiceError('NETWORK_ERROR', 'lost', true));
  await vi.advanceTimersByTimeAsync(62000);
  expect(useBungeoppang.getState()).toMatchObject({ phase: 'result', confirmExit: false });
  const request = vi.mocked(service.submitResult).mock.calls[0]![0];
  expect(request.completeKey).toMatch(/^[0-9a-f-]{36}$/);
  await submitBungeoppang();
  expect(vi.mocked(service.submitResult).mock.calls[1]![0]).toBe(request);
});
it('v4 final submission preserves the unresolved last delivery key after the 60 second boundary', async () => {
  await enterV4();
  vi.mocked(service.nextOrder!).mockReturnValueOnce(new Promise(() => {}));
  deliverBungeoppangOrder();
  const delivery = vi.mocked(service.nextOrder!).mock.calls[0]![0];
  await vi.advanceTimersByTimeAsync(62_000);
  const complete = vi.mocked(service.submitResult).mock.calls[0]![0];
  expect(complete.deliveryKey).toBe(delivery.deliveryKey);
  expect(complete.completeKey).toMatch(/^[0-9a-f-]{36}$/);
  expect(complete.log).toEqual(delivery.log);
});
it('closes play at 60 seconds even while abandon is pending, then settles only after that request fails', async () => {
  await enterV4(); escapeBungeoppang();
  let fail!: (reason: Error) => void;
  vi.mocked(service.abandon).mockReturnValueOnce(new Promise((_, reject) => { fail = reject }));
  const pending = quitBungeoppang();
  await vi.advanceTimersByTimeAsync(62000);
  expect(useBungeoppang.getState().phase).toBe('result'); expect(service.submitResult).not.toHaveBeenCalled();
  fail(new Error('unavailable')); await pending; await Promise.resolve();
  expect(service.submitResult).toHaveBeenCalledTimes(1);
});
it('shows one tool change for a real selection and no success feedback for a wrong click', async () => {
  await enterV4();
  setBungeoppangTool('chocolate'); setBungeoppangTool('chocolate');
  expect(useBungeoppang.getState().toolRevision).toBe(1);
  pressBungeoppangSlot(0);
  expect(useBungeoppang.getState().feedback).toEqual([]);
  setBungeoppangTool('batter'); pressBungeoppangSlot(0);
  await vi.advanceTimersByTimeAsync(300); setBungeoppangTool('pizza'); pressBungeoppangSlot(0);
  await vi.advanceTimersByTimeAsync(300); discardBungeoppangSlot(0);
  expect(useBungeoppang.getState().feedback).toMatchObject([{ kind: 'discard', filling: 'pizza', points: 0 }]);
  await vi.advanceTimersByTimeAsync(1400); expect(useBungeoppang.getState().feedback).toEqual([]);
});
it('uses the completed bread identity for a tray flight and emits nothing for a full-tray rejection', async () => {
  await enterV4();
  let grill = useBungeoppang.getState().grill!;
  if (!isV4Grill(grill)) throw new Error('Expected v4');
  const slots = [...grill.slots];
  slots[0] = { phase: 'back', heat: 100, since: 0, front: 80, filling: 'custard', lastAt: null };
  useBungeoppang.setState({ grill: { ...grill, slots, made: 2 } });
  await vi.advanceTimersByTimeAsync(6400); pressBungeoppangSlot(0);
  expect(useBungeoppang.getState().feedback).toMatchObject([{ kind: 'store', filling: 'custard', breadId: 3, points: 10 }]);
  await vi.advanceTimersByTimeAsync(60); discardBungeoppangTray(2);
  expect(useBungeoppang.getState().feedback.at(-1)).toMatchObject({ kind: 'discard', filling: 'custard' });
  grill = useBungeoppang.getState().grill!;
  if (!isV4Grill(grill)) throw new Error('Expected v4');
  const full = [...grill.tray, { ...grill.tray[0]!, id: 4 }, { ...grill.tray[0]!, id: 5 }];
  useBungeoppang.setState({ grill: { ...grill, tray: full, slots: [{ ...slots[0]!, since: 60 }, ...grill.slots.slice(1)] } });
  const before = useBungeoppang.getState().feedback.length;
  await vi.advanceTimersByTimeAsync(60); pressBungeoppangSlot(0);
  expect(useBungeoppang.getState().feedback).toHaveLength(before);
  expect(useBungeoppang.getState().grill!.slots[0]!.phase).toBe('back');
});
it('delivery flights include only consumed inventory and feedback never changes the submitted log', async () => {
  await enterV4();
  vi.mocked(service.nextOrder!).mockResolvedValue({ index: 1, order: firstOrder });
  deliverBungeoppangOrder(); await Promise.resolve();
  expect(useBungeoppang.getState().feedback).toHaveLength(2);
  expect(useBungeoppang.getState().feedback.every(item => item.kind === 'deliver' && item.guestIndex === 0)).toBe(true);
  expect(useBungeoppang.getState().grill!.log).toEqual([{ slot: -1, action: 'DELIVER', t: 0, order: 0 }]);
});
