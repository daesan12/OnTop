import { describe, expect, it, vi } from 'vitest';
import { BUNGEOPPANG_V5 as R, BUNGEOPPANG_V5_LEGACY } from '../../src/features/bungeoppang/config';
import { createBungeoppangV5Service } from '../../src/features/bungeoppang/serviceV5';
import { prefixHash } from '../../src/features/bungeoppang/serviceV4';
import { RestError } from '../../src/network/restError';
import { createGrill, replay, type GrillState } from '../../src/features/bungeoppang/rulesV5';
import type { BungeoppangSubmit } from '../../src/features/bungeoppang/service';
import type { BungeoppangRules, GrillLogEntry } from '../../src/features/bungeoppang/rulesV4';
import fixture from '../fixtures/bungeoppang-v5.json';

const config = 'v5-20261029.1';
const timing = { countdownStartsAt: '2026-10-27T00:00:01.000Z', playStartsAt: '2026-10-27T00:00:04.500Z',
  playEndsAt: '2026-10-27T00:02:04.500Z', submitDeadline: '2026-10-27T00:02:19.500Z', expiresAt: '2026-10-27T00:02:29.500Z' };
const heats = Array(2048).fill(100);
function wireCheckpoint(state: GrillState, revision: number, hash: string) {
  return { revision, throughSeq: state.log.length, prefixHash: hash, heatCursor: state.fills, lastAt: state.lastAt,
    slots: state.slots.map((s, slot) => ({ ...s, slot })), tray: state.tray.map(({ id, ...b }) => ({ ...b, breadId: id })),
    stats: { score: state.score, made: state.made, successfulMade: state.made - state.failed, golden: state.golden,
      failed: state.failed, wasted: state.wasted, grillDiscarded: state.wasted, trayDiscarded: 0,
      combo: state.combo, maxCombo: state.maxCombo, served: state.served, customersServed: state.customersServed,
      specialServed: state.specialServed, bonusScore: state.bonusScore }, activeOrders: state.activeOrders };
}
async function responses(rules: BungeoppangRules = R) {
  const version = rules.durationMs === 180000 ? 'v5-20261027.1' : config;
  const at = Date.parse(timing.playStartsAt), iso = (ms: number) => new Date(at + ms).toISOString();
  const roundTiming = { ...timing, playEndsAt: iso(rules.durationMs),
    submitDeadline: iso(rules.durationMs + 15000), expiresAt: iso(rules.durationMs + 25000) };
  const hash = await prefixHash('901', version, [], 'v5'), initial = createGrill(heats, fixture.orders, rules);
  const checkpoint = wireCheckpoint(initial, 0, hash);
  const source = { minigameSessionId: '901', minigameType: 'BUNGEOPPANG', rulesVersion: 'v5', configVersion: version,
    status: 'PLAYING', serverNow: '2026-10-27T00:00:00Z', timing: roundTiming, checkpoint, acceptedLog: [] };
  return { start: { ...source, startedAt: timing.playStartsAt, isFirstGame: true, heats,
    rules: { ...rules, specialOrderChancePercent: 20, heatAssignment: 'FILL' } }, session: source };
}
const deliveryInput: BungeoppangSubmit = { gameId: '901', log: [...fixture.log.slice(0, 5)] as GrillLogEntry[],
  clientScore: 10, seenTips: [], deliveryKey: 'delivery-two' };

describe('v5 draft REST port, opt-in only', () => {
  it('selects v5 explicitly, samples a fresh GET clock and restores three active orders', async () => {
    const p = await responses();
    const request = vi.fn().mockResolvedValueOnce(p.start).mockResolvedValueOnce(p.session).mockResolvedValueOnce(p.session);
    const game = await createBungeoppangV5Service(request).startGame('start');
    expect(JSON.parse(request.mock.calls[0]![1].body)).toEqual({ minigameType: 'BUNGEOPPANG', rulesVersion: 'v5' });
    expect(game.v5?.orders).toHaveLength(3); expect(game.v5?.rules.durationMs).toBe(120000);
    expect(request.mock.calls[1]![0]).toBe('/api/v1/minigames/sessions/901');
    expect(request.mock.calls[2]![0]).toContain('includeProgress=true');
  });
  it('serializes a non-first order ID and preserves one identical retry body after response loss', async () => {
    const p = await responses();
    const request = vi.fn().mockResolvedValueOnce(p.start).mockResolvedValueOnce(p.session).mockResolvedValueOnce(p.session)
      .mockRejectedValueOnce(new Error('response lost')).mockImplementationOnce(async (_path: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        const grill = replay(deliveryInput.log as GrillLogEntry[], heats, fixture.orders, R);
        grill.activeOrders.push({ ...fixture.orders[1]!, orderId: '4', availableAfterSeq: 5 });
        return { minigameSessionId: '901', deliveryKey: 'delivery-two', accepted: true,
          throughSeq: 5, prefixHash: body.prefixHash, checkpoint: wireCheckpoint(grill, 1, body.prefixHash) };
      });
    const service = createBungeoppangV5Service(request); await service.startGame('start');
    await expect(service.deliverV5!(deliveryInput)).rejects.toMatchObject({ retryable: true });
    const approved = await service.deliverV5!(deliveryInput);
    expect(request.mock.calls[3]![1].body).toBe(request.mock.calls[4]![1].body);
    const body = JSON.parse(String(request.mock.calls[4]![1].body));
    expect(body.log.at(-1)).toEqual({ seq: 5, action: 'DELIVER', t: 14850, orderId: '2', deliveryKey: 'delivery-two' });
    expect(body.log[0]).toEqual({ seq: 1, action: 'POUR', t: 0, slot: 0 });
    expect(approved.grill.activeOrders.map(o => o.orderId)).toEqual(['1', '3', '4']);
    expect(body.prefixHash).not.toBe(await prefixHash('901', config, body.log, 'v4'));
    await expect(service.deliverV5!({ ...deliveryInput, clientScore: 11 })).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_CONFLICT' });
  });
  it('does not fall back to mock rewards when the backend has not enabled v5', async () => {
    const request = vi.fn().mockRejectedValue(new RestError(409, 'RULES_VERSION_MISMATCH', 'unsupported'));
    const service = createBungeoppangV5Service(request);
    expect(service.mock).toBe(false);
    await expect(service.getStatus()).rejects.toMatchObject({ code: 'RULES_VERSION_MISMATCH', retryable: false });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('rejects old heat assignment and duplicate customer slots', async () => {
    const p = await responses();
    const request = vi.fn().mockResolvedValue({ ...p.start, rules: { ...p.start.rules, heatAssignment: 'POUR' } });
    await expect(createBungeoppangV5Service(request).startGame('start')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    p.start.checkpoint.activeOrders[1]!.customerSlot = 0;
    const duplicate = vi.fn().mockResolvedValue(p.start);
    await expect(createBungeoppangV5Service(duplicate).startGame('start')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  it('rejects a 60-second clock presented with v5 rules', async () => {
    const p = await responses(); p.start.timing = { ...timing, playEndsAt: '2026-10-27T00:01:04.500Z' };
    await expect(createBungeoppangV5Service(vi.fn().mockResolvedValue(p.start)).startGame('start')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  it.each([60000, 150000])('rejects a mismatched rush start %i in a two-minute round', async rushFromMs => {
    const p = await responses(); p.start.rules.rushFromMs = rushFromMs;
    await expect(createBungeoppangV5Service(vi.fn().mockResolvedValue(p.start)).startGame('start'))
      .rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  it('keeps the server-issued legacy clock and can submit actions after two minutes', async () => {
    const p = await responses(BUNGEOPPANG_V5_LEGACY);
    const request = vi.fn().mockResolvedValueOnce(p.start).mockResolvedValueOnce(p.session).mockResolvedValueOnce(p.session)
      .mockRejectedValueOnce(new RestError(422, 'LOG_INVALID', 'server rejection'));
    const service = createBungeoppangV5Service(request), game = await service.startGame('legacy');
    expect(game.v5?.rules).toMatchObject({ durationMs: 180000, rushFromMs: 150000 });
    await expect(service.submitResult({ gameId: '901', log: [{ slot: 0, action: 'POUR', t: 150000 }],
      clientScore: 0, seenTips: [], completeKey: 'legacy-complete' })).rejects.toMatchObject({ code: 'LOG_INVALID' });
    expect(JSON.parse(request.mock.calls[3]![1].body).log[0].t).toBe(150000);
  });
  it('blocks actions at the two-minute end before making a completion request', async () => {
    const p = await responses();
    const request = vi.fn().mockResolvedValueOnce(p.start).mockResolvedValueOnce(p.session).mockResolvedValueOnce(p.session);
    const service = createBungeoppangV5Service(request); await service.startGame('two-minute');
    await expect(service.submitResult({ gameId: '901', log: [{ slot: 0, action: 'POUR', t: 120000 }],
      clientScore: 0, seenTips: [], completeKey: 'two-minute-complete' })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    expect(request).toHaveBeenCalledTimes(3);
  });
});
