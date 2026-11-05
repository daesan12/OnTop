import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBungeoppangV4Service, resetBungeoppangV4Sessions } from '../../src/features/bungeoppang/serviceV4';
import type { BungeoppangSubmit } from '../../src/features/bungeoppang/service';
import { RestError } from '../../src/network/restError';

const items = (bean = 0, custard = 0, pizza = 0, chocolate = 0) => ({ bean, custard, pizza, chocolate });
const rules = { slots: 6, durationMs: 60000, countdownMs: 3500, sideMs: 8000, rushSideMs: 6000,
  rushFromMs: 40000, heatMin: 85, heatMax: 115, heatListLength: 512, trayCapacity: 4, maxOrderItems: 4,
  specialOrderChancePercent: 20, specialBonusPercent: 50, firstOrder: items(2), okFrom: 50, goldenFrom: 70,
  goldenTo: 90, burntFrom: 100, okPoint: 2, goldenPoint: 5, pointsPerCoin: 15, dailyCoinCap: 500,
  minGapMs: 50, sameSlotGapMs: 300, maxLogEntries: 1200 };
const initialHash = '57b9fe339b296f349f03b006a396e0d29e865f7770ab36162eb5ee606c7fd2e7';
const emptySlots = () => Array.from({ length: 6 }, (_, slot) => ({ slot, phase: 'empty', since: 0,
  heat: 100, filling: null, front: 0, lastAt: null }));
const stats = (patch: Record<string, number> = {}) => ({ score: 0, made: 0, successfulMade: 0, golden: 0,
  failed: 0, wasted: 0, grillDiscarded: 0, trayDiscarded: 0, combo: 0, maxCombo: 0, served: 0,
  customersServed: 0, specialServed: 0, bonusScore: 0, ...patch });
const firstOrder = { orderId: '1', orderIndex: 0, items: items(2) };
const nextOrder = { orderId: '2', orderIndex: 1, items: items(0, 1) };
const timing = { countdownStartsAt: '2026-10-27T00:00:01Z', playStartsAt: '2026-10-27T00:00:04.5Z',
  playEndsAt: '2026-10-27T00:01:04.5Z', submitDeadline: '2026-10-27T00:01:19.5Z',
  expiresAt: '2026-10-27T00:01:29.5Z' };
const start = { minigameSessionId: '901', minigameType: 'BUNGEOPPANG', status: 'PLAYING', phase: 'WAITING_START',
  rulesVersion: 'v4', configVersion: 'v4-20261027.1', issuedAt: '2026-10-27T00:00:00Z',
  startedAt: '2026-10-27T00:00:00Z', timing, rules, heats: Array(512).fill(100), isFirstGame: true,
  checkpoint: { revision: 0, throughSeq: 0, prefixHash: initialHash, heatCursor: 0, lastAt: null,
    slots: emptySlots(), tray: [], stats: stats(), currentOrder: firstOrder } };
const localLog = [
  { slot: 0, action: 'POUR', t: 0 }, { slot: 0, action: 'FILL', t: 300, filling: 'bean' },
  { slot: 0, action: 'TURN', t: 6700 }, { slot: 0, action: 'TURN', t: 13100 },
  { slot: 1, action: 'POUR', t: 13200 }, { slot: 1, action: 'FILL', t: 13500, filling: 'bean' },
  { slot: 1, action: 'TURN', t: 19900 }, { slot: 1, action: 'TURN', t: 26300 },
  { slot: -1, action: 'DELIVER', t: 26400, order: 0 },
] as BungeoppangSubmit['log'];
const deliveryHash = '3390310f411991a992eabfe657bc5022cb0d10fe4dcff34f1e33813164407d34';
const acceptedCheckpoint = { revision: 1, throughSeq: 9, prefixHash: deliveryHash, heatCursor: 2,
  lastAt: 26400, slots: emptySlots().map((slot, index) => index < 2 ? { ...slot, lastAt: index ? 26300 : 13100 } : slot),
  tray: [], stats: stats({ score: 20, made: 2, successfulMade: 2, golden: 2, combo: 2, maxCombo: 2,
    served: 2, customersServed: 1 }), currentOrder: nextOrder };
const delivery = { minigameSessionId: '901', deliveryKey: 'delivery-901-1', orderId: '1', accepted: true,
  acceptedAt: '2026-10-27T00:00:31Z', throughSeq: 9, prefixHash: deliveryHash, consumedBreadIds: [1, 2],
  scoreDelta: 20, bonusDelta: 0, nextOrder, checkpoint: acceptedCheckpoint };
const completed = { minigameSessionId: '901', status: 'COMPLETED', rulesVersion: 'v4',
  configVersion: 'v4-20261027.1', verifiedCompletedCount: 0, rewardAmount: 0, score: 0, made: 0,
  golden: 0, failed: 0, wasted: 0, maxCombo: 0, coinsCalculated: 0, coinsGranted: 0,
  todayEarned: 0, dailyCap: 500, capReached: false, successfulMade: 0, served: 0,
  customersServed: 0, specialServed: 0, bonusScore: 0, grillDiscarded: 0, trayDiscarded: 0,
  undeliveredCount: 0, unfinishedGrillCount: 0, rewardDate: '2026-10-27',
  settledAt: '2026-10-27T00:01:05Z', finalThroughSeq: 0, finalPrefixHash: initialHash };
const startedSession = { minigameSessionId: '901', rulesVersion: 'v4', configVersion: start.configVersion,
  status: 'PLAYING', serverNow: start.issuedAt, timing, result: null };

describe('Bungeoppang v4 production REST adapter', () => {
  beforeEach(() => resetBungeoppangV4Sessions());
  afterEach(() => vi.restoreAllMocks());

  it('selects v4 explicitly and converts a frozen local delivery into the canonical server contract', async () => {
    const request = vi.fn().mockResolvedValueOnce(start).mockResolvedValueOnce(startedSession).mockResolvedValueOnce(delivery);
    const service = createBungeoppangV4Service(request);
    const game = await service.startGame('start-v4-1');
    expect(game.v4?.order).toEqual(firstOrder);
    expect(JSON.parse(String(request.mock.calls[0]![1].body))).toEqual({ minigameType: 'BUNGEOPPANG', rulesVersion: 'v4' });
    const frozen = { gameId: '901', log: localLog, clientScore: 20, seenTips: [], deliveryKey: 'delivery-901-1' };
    await expect(service.nextOrder!(frozen)).resolves.toMatchObject({ index: 1, order: nextOrder });
    expect(request.mock.calls[1]![0]).toBe('/api/v1/minigames/sessions/901');
    const call = request.mock.calls[2]!;
    expect(call[0]).toBe('/api/v1/minigames/sessions/901/deliveries');
    expect(call[1].headers).toMatchObject({ 'Idempotency-Key': 'delivery-901-1' });
    const body = JSON.parse(String(call[1].body));
    expect(body.prefixHash).toBe(deliveryHash);
    expect(body.log).toMatchObject([
      { seq: 1, action: 'POUR', slot: 0 },
      { seq: 2, action: 'FILL', slot: 0, filling: 'bean' },
      ...Array(6).fill({}),
      { seq: 9, action: 'DELIVER', orderId: '1', deliveryKey: 'delivery-901-1' },
    ]);
  });

  it('keeps the shared status and wallet guidance for v4 error codes', async () => {
    const request = vi.fn()
      .mockRejectedValueOnce(new RestError(503, 'MINIGAME_NOT_CONFIGURED', '서버 요청에 실패했습니다. (503)'))
      .mockRejectedValueOnce(new RestError(409, 'WALLET_NOT_READY', '서버 요청에 실패했습니다. (409)'));
    const service = createBungeoppangV4Service(request);

    await expect(service.getStatus()).rejects.toMatchObject({ code: 'MINIGAME_NOT_CONFIGURED', retryable: true,
      message: '붕어빵 서버 설정이 아직 준비되지 않았어요.' });
    await expect(service.balance()).rejects.toMatchObject({ code: 'WALLET_NOT_READY', retryable: false,
      message: expect.stringContaining('운영 담당자의 지갑 초기화가 필요합니다') });
  });

  it('retries an uncertain delivery with the exact key and body', async () => {
    const request = vi.fn().mockResolvedValueOnce(start).mockResolvedValueOnce(startedSession)
      .mockRejectedValueOnce(new Error('lost')).mockResolvedValueOnce(delivery);
    const service = createBungeoppangV4Service(request);
    await service.startGame('start-v4-1');
    const frozen = { gameId: '901', log: localLog, clientScore: 20, seenTips: [], deliveryKey: 'delivery-901-1' };
    await expect(service.nextOrder!(frozen)).rejects.toMatchObject({ code: 'NETWORK_ERROR', retryable: true });
    await expect(service.nextOrder!(frozen)).resolves.toMatchObject({ order: nextOrder });
    expect(request.mock.calls[2]![1].body).toBe(request.mock.calls[3]![1].body);
    expect(request.mock.calls[2]![1].headers).toEqual(request.mock.calls[3]![1].headers);
  });

  it('loads the authoritative checkpoint and accepted prefix for explicit rejection recovery', async () => {
    const acceptedLog = localLog.map((entry, index) => ({ seq: index + 1, action: entry.action, t: entry.t,
      ...(['POUR', 'FILL', 'TURN', 'DISCARD'].includes(entry.action) ? { slot: entry.slot } : {}),
      ...(entry.action === 'FILL' ? { filling: 'filling' in entry ? entry.filling : 'bean' } : {}),
      ...(entry.action === 'DELIVER' ? { orderId: '1', deliveryKey: 'delivery-901-1' } : {}) }));
    const status = { minigameSessionId: '901', rulesVersion: 'v4', status: 'PLAYING', checkpoint: acceptedCheckpoint,
      acceptedLog, issuedOrders: [firstOrder, nextOrder] };
    const request = vi.fn().mockResolvedValueOnce(start).mockResolvedValueOnce(startedSession).mockResolvedValueOnce(status);
    const service = createBungeoppangV4Service(request);
    await service.startGame('start-v4-1');
    const recovery = await service.recoverV4!('901');
    expect(request.mock.calls[2]![0]).toBe('/api/v1/minigames/sessions/901?includeProgress=true');
    expect(recovery.grill).toMatchObject({ score: 20, orderIndex: 1, order: nextOrder, log: { length: 9 } });
  });

  it('restores an already delivered round in a fresh adapter using only existing GET endpoints', async () => {
    const acceptedLog = localLog.map((entry, index) => ({ seq: index + 1, action: entry.action, t: entry.t,
      ...(['POUR', 'FILL', 'TURN', 'DISCARD'].includes(entry.action) ? { slot: entry.slot } : {}),
      ...(entry.action === 'FILL' ? { filling: 'filling' in entry ? entry.filling : 'bean' } : {}),
      ...(entry.action === 'DELIVER' ? { orderId: '1', deliveryKey: 'delivery-901-1' } : {}) }));
    const source = { ...start, ...startedSession, serverNow: '2026-10-27T00:00:35.000Z',
      checkpoint: acceptedCheckpoint, acceptedLog, issuedOrders: [firstOrder, nextOrder] };
    const request = vi.fn().mockResolvedValue(source);
    const restored = await createBungeoppangV4Service(request).resumeGame!('901');
    expect(restored.v4?.grill).toMatchObject({ score: 20, made: 2, order: nextOrder, log: { length: 9 } });
    expect(restored.v4?.timeSync).toMatchObject({ timing, sample: { serverNowMs: Date.parse(source.serverNow) } });
    expect(request.mock.calls[0]![0]).toBe('/api/v1/minigames/sessions/901?includeSource=true&includeProgress=true');
    expect(request.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true);
  });

  it('retains the active session id and rejects malformed ids without treating them as no active round', async () => {
    const lobby = { rulesVersion: 'v4', todayEarned: 0, dailyCap: 500, isFirstGame: false, seenTips: [], activeSessionId: '901' };
    await expect(createBungeoppangV4Service(vi.fn().mockResolvedValue(lobby)).getStatus()).resolves.toMatchObject({ activeSessionId: '901' });
    await expect(createBungeoppangV4Service(vi.fn().mockResolvedValue({ ...lobby, activeSessionId: '../901' })).getStatus())
      .rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('does not restart or complete an expired source during reload recovery', async () => {
    const request = vi.fn().mockResolvedValue({ minigameSessionId: '901', status: 'INVALID' });
    await expect(createBungeoppangV4Service(request).resumeGame!('901')).rejects.toMatchObject({ code: 'GAME_NOT_ACTIVE' });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('freezes the final idempotency key and sends the canonical full log contract', async () => {
    const request = vi.fn().mockResolvedValueOnce(start).mockResolvedValueOnce(startedSession).mockResolvedValueOnce(completed);
    const service = createBungeoppangV4Service(request);
    await service.startGame('start-v4-1');

    await expect(service.submitResult({ gameId: '901', log: [], clientScore: 999, seenTips: ['START'],
      completeKey: 'complete-901-1' })).resolves.toMatchObject({ score: 0, coinsGranted: 0,
        rewardDate: '2026-10-27', rulesVersion: 'v4' });

    const call = request.mock.calls[2]!;
    expect(call[0]).toBe('/api/v1/minigames/sessions/901/complete');
    expect(call[1].headers).toMatchObject({ 'Idempotency-Key': 'complete-901-1' });
    expect(JSON.parse(String(call[1].body))).toEqual({ rulesVersion: 'v4', throughSeq: 0,
      prefixHash: initialHash, log: [], seenTips: ['START'], clientScore: 999 });
  });

  it('recovers an ambiguous final response from the immutable completed session result', async () => {
    const loaded = { minigameSessionId: '901', status: 'COMPLETED', rulesVersion: 'v4', result: completed };
    const request = vi.fn().mockResolvedValueOnce(start).mockResolvedValueOnce(startedSession).mockRejectedValueOnce(new Error('lost'))
      .mockResolvedValueOnce(loaded);
    const service = createBungeoppangV4Service(request);
    await service.startGame('start-v4-1');

    await expect(service.submitResult({ gameId: '901', log: [], clientScore: 0, seenTips: [],
      completeKey: 'complete-901-1' })).resolves.toMatchObject({ score: 0, settledAt: completed.settledAt });
    expect(request.mock.calls[3]![0]).toBe('/api/v1/minigames/sessions/901?includeProgress=true');
  });

  it('anchors a fresh GET to monotonic RTT even when the PC calendar is wrong', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse(start.issuedAt) + 3_600_000);
    vi.spyOn(performance, 'now').mockReturnValueOnce(100).mockReturnValueOnce(140);
    const request = vi.fn().mockResolvedValueOnce(start).mockResolvedValueOnce(startedSession);
    const game = await createBungeoppangV4Service(request).startGame('clock-test');
    expect(game.v4!.timeSync).toMatchObject({ status: 'PLAYING',
      sample: { serverNowMs: Date.parse(startedSession.serverNow), receivedAt: 140, rttMs: 40 } });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('resamples a slow GET without changing the round or repeating the start', async () => {
    vi.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValueOnce(1200)
      .mockReturnValueOnce(1200).mockReturnValueOnce(1400);
    const request = vi.fn().mockResolvedValueOnce(start).mockResolvedValue(startedSession);
    const game = await createBungeoppangV4Service(request).startGame('clock-test');
    expect(game.v4!.timeSync!.sample.rttMs).toBe(200);
    expect(request.mock.calls.map(call => call[0])).toEqual(['/api/v1/minigames/sessions',
      '/api/v1/minigames/sessions/901', '/api/v1/minigames/sessions/901']);
  });

  it('bounds slow-clock retries and keeps the start failure retryable', async () => {
    let monotonic = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => monotonic += 1100);
    const request = vi.fn().mockResolvedValueOnce(start).mockResolvedValue(startedSession);
    await expect(createBungeoppangV4Service(request).startGame('clock-test'))
      .rejects.toMatchObject({ code: 'TIME_SYNC_SLOW', retryable: true });
    expect(request).toHaveBeenCalledTimes(4);
  });

  it('checks an old start receipt and restores its completed result instead of trusting PLAYING', async () => {
    const request = vi.fn().mockResolvedValueOnce(start).mockResolvedValueOnce({ ...startedSession,
      status: 'COMPLETED', serverNow: completed.settledAt, result: completed });
    const game = await createBungeoppangV4Service(request).startGame('old-start');
    expect(game.v4!.timeSync).toMatchObject({ status: 'COMPLETED', result: { finalPrefixHash: initialHash } });
  });

  it('refuses a GET that changes the original round timing', async () => {
    const request = vi.fn().mockResolvedValueOnce(start).mockResolvedValueOnce({ ...startedSession,
      timing: { ...timing, expiresAt: '2026-10-27T00:02:00Z' } });
    await expect(createBungeoppangV4Service(request).startGame('clock-test'))
      .rejects.toMatchObject({ code: 'INVALID_RESPONSE', retryable: true });
  });
});
