import { describe, expect, it } from 'vitest';
import { createV5PreviewService } from '../../src/features/bungeoppang/serviceV5Preview';
import { BUNGEOPPANG_V5 as R } from '../../src/features/bungeoppang/config';
import type { BungeoppangSubmit } from '../../src/features/bungeoppang/service';
import fixture from '../fixtures/bungeoppang-v5.json';
import type { GrillLogEntry } from '../../src/features/bungeoppang/rulesV4';

describe('v5 explicit issuer simulation', () => {
  it('keeps the same original game on start retry and returns exactly three active customers', async () => {
    const service = createV5PreviewService(() => 0, () => 0);
    const a = await service.startGame('start'), b = await service.startGame('start');
    expect(a).toEqual(b); expect(a.v5?.orders).toHaveLength(3); expect(a.heats).toHaveLength(2048);
    a.heats[0] = 999; expect((await service.startGame('start')).heats[0]).toBe(85);
    expect(service.mock).toBe(true);
  });
  it('rejects early completion and grants zero real coins after an actual two minute round', async () => {
    let now = 0;
    const service = createV5PreviewService(() => .5, () => now), game = await service.startGame('start');
    const input = { gameId: game.gameId, log: [], clientScore: 99999, seenTips: [] };
    now = R.countdownMs + 119999;
    await expect(service.submitResult(input)).rejects.toMatchObject({ code: 'TOO_EARLY' });
    now++;
    await expect(service.submitResult(input)).resolves.toMatchObject({ score: 0, coinsGranted: 0, rulesVersion: 'v5' });
  });
  it('a repeated delivery returns the same replacement and a changed same-key log conflicts', async () => {
    // 0.5 issues heat100 and basic custard orders; serve the guaranteed first bean2 order.
    const service = createV5PreviewService(() => .5, () => 0), game = await service.startGame('start');
    const one = (fixture.log as GrillLogEntry[]).slice(0, 4);
    const log = [...one, ...one.map(e => ({ ...e, slot: 1, t: e.t + 16000 })),
      { slot: -1, action: 'DELIVER' as const, orderId: '1', t: 30850 }];
    const input: BungeoppangSubmit = { gameId: game.gameId, log, deliveryKey: 'd1', seenTips: [], clientScore: 20 };
    const a = await service.deliverV5!(input), b = await service.deliverV5!(input);
    expect(a).toEqual(b); expect(a.grill.activeOrders).toHaveLength(3);
    expect(a.grill.activeOrders.find(o => o.customerSlot === 0)?.orderId).toBe('4');
    expect(a.grill.customersServed).toBe(1);
    await expect(service.deliverV5!({ ...input, log: log.map((e, i) => i === 8 ? { ...e, t: 30900 } : e) }))
      .rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_CONFLICT' });
  });
  it('abandon prevents future deliveries and completion and cannot grant rewards', async () => {
    const service = createV5PreviewService(), game = await service.startGame('start');
    await service.abandon(game.gameId);
    await expect(service.submitResult({ gameId: game.gameId, log: [], clientScore: 0, seenTips: [] }))
      .rejects.toMatchObject({ code: 'GAME_NOT_ACTIVE' });
    await expect(service.balance()).rejects.toThrow('지갑');
  });
});
