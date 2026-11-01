import { describe, expect, it, vi } from 'vitest';
import { BUNGEOPPANG_V5, BUNGEOPPANG_V5_LEGACY } from '../../src/features/bungeoppang/config';
import { createBungeoppangV5Service } from '../../src/features/bungeoppang/serviceV5';
import { prefixHash } from '../../src/features/bungeoppang/serviceV4';
import { createGrill, replay, type CustomerOrder, type GrillState } from '../../src/features/bungeoppang/rulesV5';
import type { GrillLogEntry } from '../../src/features/bungeoppang/rulesV4';
import legacyFlow from '../fixtures/bungeoppang-v5-flow.json';
import twoMinuteFlow from '../fixtures/bungeoppang-v5-2min-flow.json';

/** Server-shaped checkpoint from the FE replay, as the backend serializes it. */
function wireCheckpoint(state: GrillState, revision: number, hash: string) {
  return { revision, throughSeq: state.log.length, prefixHash: hash, heatCursor: state.fills, lastAt: state.lastAt,
    slots: state.slots.map((s, slot) => ({ ...s, slot })), tray: state.tray.map(({ id, ...b }) => ({ ...b, breadId: id })),
    stats: { score: state.score, made: state.made, successfulMade: state.made - state.failed, golden: state.golden,
      failed: state.failed, wasted: state.wasted, grillDiscarded: state.wasted, trayDiscarded: 0,
      combo: state.combo, maxCombo: state.maxCombo, served: state.served, customersServed: state.customersServed,
      specialServed: state.specialServed, bonusScore: state.bonusScore }, activeOrders: state.activeOrders };
}

describe.each([
  { name: 'two minutes', R: { ...BUNGEOPPANG_V5, queueComplaintPenalty: 0 }, flow: twoMinuteFlow, config: 'v5-20261029.1' },
  // Keep the fixture already used by BE tests intact during deployment transition.
  { name: 'legacy three minutes', R: BUNGEOPPANG_V5_LEGACY, flow: legacyFlow, config: 'v5-20261027.1' },
])('v5 shared full-round flow: $name', ({ R, flow, config }) => {
  const heats = Array(2048).fill(flow.heat), history = flow.orders as CustomerOrder[];
  const log = flow.log as GrillLogEntry[], keys = flow.deliveryKeys as Record<string, string>;
  const at = Date.parse('2026-10-28T00:00:04.500Z'), iso = (ms: number) => new Date(at + ms).toISOString();
  const timing = { countdownStartsAt: iso(-3500), playStartsAt: iso(0), playEndsAt: iso(R.durationMs),
    submitDeadline: iso(R.durationMs + 15000), expiresAt: iso(R.durationMs + 25000) };
  it('FE replay of the shared round reaches the shared final result', () => {
    const state = replay(log, heats, history, R);
    const e = flow.expected;
    expect({ score: state.score, made: state.made, golden: state.golden, failed: state.failed, wasted: state.wasted,
      combo: state.combo, maxCombo: state.maxCombo, served: state.served, customersServed: state.customersServed,
      specialServed: state.specialServed, bonusScore: state.bonusScore, fills: state.fills })
      .toEqual({ score: e.score, made: e.made, golden: e.golden, failed: e.failed, wasted: e.wasted, combo: e.combo,
        maxCombo: e.maxCombo, served: e.served, customersServed: e.customersServed, specialServed: e.specialServed,
        bonusScore: e.bonusScore, fills: e.fills });
    expect(state.tray).toEqual(e.tray);
    expect(state.activeOrders.map(o => o.orderId)).toEqual(e.activeOrders);
    expect(Math.floor(state.score / R.pointsPerCoin)).toBe(e.coinsCalculated);
  });

  it('each approved delivery consumes the shared bread IDs and refills the same customer slot', () => {
    for (const d of flow.deliveries) {
      const before = replay(log.slice(0, d.throughSeq - 1), heats, history, R);
      const after = replay(log.slice(0, d.throughSeq), heats, history, R);
      const remaining = new Set(after.tray.map(b => b.id));
      expect(before.tray.map(b => b.id).filter(id => !remaining.has(id))).toEqual(d.consumedBreadIds);
      expect(after.score - before.score).toBe(d.scoreDelta);
      expect(after.tray.map(b => b.id)).toEqual(d.tray);
      expect(after.activeOrders.map(o => o.orderId)).toEqual(d.activeOrders);
      const delivered = history.find(o => o.orderId === d.orderId)!;
      const replacement = history.find(o => o.orderId === d.replacementOrderId)!;
      expect(replacement).toMatchObject({ customerSlot: delivered.customerSlot, availableAfterSeq: d.throughSeq });
    }
  });

  it('the adapter sends the shared wire log for three deliveries and the completion', async () => {
    const opening = createGrill(heats, history.filter(o => o.availableAfterSeq === 0), R);
    const session = { minigameSessionId: '901', minigameType: 'BUNGEOPPANG', rulesVersion: 'v5', configVersion: config,
      status: 'PLAYING', serverNow: '2026-10-28T00:00:00Z', timing,
      checkpoint: wireCheckpoint(opening, 0, await prefixHash('901', config, [], 'v5')), acceptedLog: [] };
    const start = { ...session, startedAt: timing.playStartsAt, isFirstGame: true, heats,
      rules: { ...R, specialOrderChancePercent: 20, heatAssignment: 'FILL' } };
    const bodies: Record<string, unknown>[] = [];
    let revision = 0;
    const request = vi.fn(async (path: string, init?: RequestInit) => {
      if (!init?.body) return session;
      const body = JSON.parse(String(init.body));
      if (path.endsWith('/sessions')) return start;
      bodies.push(body);
      const state = replay(log.slice(0, body.throughSeq), heats, history, R);
      if (path.endsWith('/complete')) return { minigameSessionId: '901', status: 'COMPLETED', rulesVersion: 'v5',
        configVersion: config, verifiedCompletedCount: state.made, rewardAmount: 2, score: state.score, made: state.made,
        golden: state.golden, failed: state.failed, wasted: state.wasted, maxCombo: state.maxCombo,
        coinsCalculated: 2, coinsGranted: 2, todayEarned: 2, dailyCap: 500, capReached: false,
        successfulMade: state.made, served: state.served, customersServed: state.customersServed,
        specialServed: state.specialServed, bonusScore: state.bonusScore, grillDiscarded: 1, trayDiscarded: 1,
        undeliveredCount: 0, unfinishedGrillCount: 0, rewardDate: '2026-10-28', settledAt: iso(R.durationMs + 500),
        finalThroughSeq: body.throughSeq, finalPrefixHash: body.prefixHash };
      return { minigameSessionId: '901', deliveryKey: body.log.at(-1).deliveryKey, accepted: true,
        throughSeq: body.throughSeq, prefixHash: body.prefixHash, checkpoint: wireCheckpoint(state, ++revision, body.prefixHash) };
    });
    const service = createBungeoppangV5Service(request);
    await service.startGame('start');

    for (const d of flow.deliveries) {
      const approved = await service.deliverV5!({ gameId: '901', log: log.slice(0, d.throughSeq), clientScore: 0,
        seenTips: [], deliveryKey: keys[String(d.throughSeq)] });
      expect(approved.grill.activeOrders.map(o => o.orderId)).toEqual(d.activeOrders);
    }
    const result = await service.submitResult({ gameId: '901', log, clientScore: 0, seenTips: [], completeKey: 'flow-done' });

    expect(result.score).toBe(flow.expected.score);
    expect(bodies).toHaveLength(4);
    for (const body of bodies) {
      const wire = body.log as { seq: number; action: string; deliveryKey?: string }[];
      expect(body.prefixHash).toBe(await prefixHash('901', config, wire as never, 'v5'));
      // Every DELIVER keeps its own approved key, in the deliveries and in the completion alike.
      for (const action of wire.filter(a => a.action === 'DELIVER')) expect(action.deliveryKey).toBe(keys[String(action.seq)]);
    }
    expect((bodies.at(-1)!.log as unknown[])).toHaveLength(log.length);
  });
});
