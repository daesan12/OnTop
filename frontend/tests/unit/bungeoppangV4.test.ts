import { describe, expect, it } from 'vitest';
import { BUNGEOPPANG_V4 as R } from '../../src/features/bungeoppang/config';
import { actionFor, applyAction, BungeoppangRuleError, cookLevel, createGrill, emptyFillingCounts, judge,
  makeHeatList, makeOrderList, replayGrill, summarize, supplyOrder, type BreadFilling, type BreadOrder,
  type GrillLogEntry, type GrillState } from '../../src/features/bungeoppang/rulesV4';
import { createV4PreviewService } from '../../src/features/bungeoppang/serviceV4Preview';
import sharedFixture from '../fixtures/bungeoppang-v4.json';

const order = (items: Partial<BreadOrder['items']>): BreadOrder => ({ items: { ...emptyFillingCounts(), ...items } });
const first = order({ bean: 2 });
const run = (state: GrillState, slot: number, action: GrillLogEntry['action'], t: number, extra = {}) =>
  applyAction(state, { slot, action, t, ...extra }, R).state;
function bake(state: GrillState, slot: number, filling: BreadFilling, at: number) {
  state = run(state, slot, 'POUR', at);
  state = run(state, slot, 'FILL', at + 300, { filling });
  state = run(state, slot, 'TURN', at + 6700);
  return run(state, slot, 'TURN', at + 13100);
}
describe('v4 deterministic shared FE/BE cases', () => {
  it('replays the language-neutral BE handoff fixture including inventory, order and heat position', () => {
    const log = sharedFixture.log as GrillLogEntry[];
    let state = createGrill(sharedFixture.heats, sharedFixture.orders[0]!, R);
    for (const entry of log) state = applyAction(state, entry, R).state;
    expect(state).toMatchObject(sharedFixture.expectedState);
    expect(replayGrill(log, sharedFixture.heats, sharedFixture.orders, R)).toEqual({ ...sharedFixture.expected, coins: 4 });
  });
  it.each([[85, 68, 'GOOD'], [100, 80, 'PERFECT'], [115, 92, 'GOOD']] as const)('heat %s cooks to %s', (heat, level, quality) => {
    expect(cookLevel(0, 6400, heat, R)).toBe(level); expect(judge(level, R)).toBe(quality);
  });
  it('rounds once across rush and preserves the assigned heat on the back', () => {
    expect(cookLevel(38000, 42000, 100, R)).toBe(58);
    let state = createGrill([85], first, R);
    state = run(state, 0, 'POUR', 0); state = run(state, 0, 'FILL', 300, { filling: 'chocolate' });
    state = run(state, 0, 'TURN', 6700);
    expect(state.slots[0]).toMatchObject({ heat: 85, front: 68, since: 6700, phase: 'back' });
  });
  it.each([[49, 'RAW'], [50, 'GOOD'], [69, 'GOOD'], [70, 'PERFECT'], [90, 'PERFECT'], [91, 'GOOD'], [99, 'GOOD'], [100, 'BURNT']] as const)('quality boundary %s', (level, expected) => expect(judge(level, R)).toBe(expected));
  it('consumes issuer heat only on successful fills, in fill order, including after discard', () => {
    let state = createGrill([85, 115], first, R);
    expect(actionFor('batter', 'batter')).toBe('NEED_FILLING');
    state = run(state, 5, 'POUR', 0); state = run(state, 0, 'POUR', 50);
    state = run(state, 5, 'FILL', 300, { filling: 'bean' });
    const before = structuredClone(state);
    expect(() => run(state, 5, 'FILL', 600, { filling: 'pizza' })).toThrow(BungeoppangRuleError);
    expect(state).toEqual(before);
    state = run(state, 5, 'DISCARD', 600);
    state = run(state, 0, 'FILL', 650, { filling: 'chocolate' });
    expect(state.slots[0]!.heat).toBe(115); expect(state.fills).toBe(2);
    state = run(state, 5, 'POUR', 900);
    const exhausted = structuredClone(state);
    expect(() => run(state, 5, 'FILL', 1200, { filling: 'custard' })).toThrow('모두 사용');
    expect(state).toEqual(exhausted);
  });
  it.each([[], [NaN], [84], [116], [99.5], Array(2)])('rejects malformed issuer heat %j', heats => {
    expect(() => createGrill(heats, first, R)).toThrow('불 세기 원본');
  });
  it.each([0, 5, -1, 1.5, NaN])('rejects invalid order quantity %s', amount => {
    expect(() => createGrill([100], order({ bean: amount }), R)).toThrow(BungeoppangRuleError);
  });
  it('delivers exact FIFO quantities, adds only special bonus, retains extras and blocks duplicate orders', () => {
    let state = createGrill([100], order({ bean: 1, pizza: 1 }), R);
    state.tray = [
      { id: 1, filling: 'bean', front: 80, back: 80, points: 10 },
      { id: 2, filling: 'custard', front: 80, back: 60, points: 7 },
      { id: 3, filling: 'pizza', front: 80, back: 80, points: 12 },
      { id: 4, filling: 'bean', front: 60, back: 60, points: 4 },
    ];
    state = run(state, -1, 'DELIVER', 0, { order: 0 });
    expect(state).toMatchObject({ score: 28, bonusScore: 6, served: 2, customersServed: 1, order: null });
    expect(state.tray.map(b => b.id)).toEqual([2, 4]);
    expect(() => run(state, -1, 'DELIVER', 50, { order: 0 })).toThrow('바뀐 주문');
    state = supplyOrder(state, 1, order({ custard: 1 }), R);
    expect(() => supplyOrder(state, 1, first, R)).toThrow('바뀐 주문');
  });
  it('does not partially consume an incomplete order and rounds each special bread bonus down', () => {
    let state = createGrill([100], order({ pizza: 1, chocolate: 1 }), R);
    state.tray = [{ id: 1, filling: 'pizza', front: 80, back: 60, points: 7 }];
    expect(() => run(state, -1, 'DELIVER', 0, { order: 0 })).toThrow('부족');
    expect(state.tray).toHaveLength(1); expect(state.score).toBe(0);
    state.tray.push({ ...state.tray[0]!, id: 2, filling: 'chocolate' });
    state = run(state, -1, 'DELIVER', 0, { order: 0 });
    expect(state.score).toBe(20); expect(state.bonusScore).toBe(6);
  });
  it('full tray rejects valid take-out without mutation but allows failed bread to be removed', () => {
    let state = createGrill([100], first, R);
    state.slots[0] = { phase: 'back', heat: 100, since: 0, front: 80, filling: 'bean', lastAt: 0 };
    state.tray = Array.from({ length: 4 }, (_, id) => ({ id, filling: 'bean', front: 80, back: 80, points: 10 }));
    state.combo = 3;
    const before = structuredClone(state);
    expect(() => run(state, 0, 'TURN', 6400)).toThrow('가득'); expect(state).toEqual(before);
    state = run(state, 0, 'TURN', 8000);
    expect(state).toMatchObject({ combo: 0, failed: 1 }); expect(state.tray).toHaveLength(4);
  });
  it('freezes 3/6 combo storage points and replays deliveries while excluding undelivered stock', () => {
    let state = createGrill(Array(6).fill(100), order({ bean: 3 }), R);
    for (let i = 0; i < 6; i++) {
      // Model parallel six-slot cooking; isolate each completed bread for the boundary assertions.
      state.slots[i] = { phase: 'back', heat: 100, since: 1000 + i * 50, front: 80, filling: 'bean', lastAt: 0 };
      if (i === 4) state.tray = [];
      state = run(state, i, 'TURN', 7400 + i * 50);
      expect(state.tray.at(-1)!.points).toBe(i === 5 ? 15 : i >= 2 ? 12 : 10);
    }
    expect(summarize(state, R).score).toBe(0);
    let played = createGrill([100, 100], first, R);
    played = bake(played, 0, 'bean', 0); played = bake(played, 1, 'bean', 13200);
    played = run(played, -1, 'DELIVER', 26400, { order: 0 });
    expect(replayGrill(played.log, [100, 100], [first], R)).toEqual(summarize(played, R));
    expect(played.score).toBe(20);
  });
  it('issues valid orders and unbiased shared heat ranges using deterministic random input', () => {
    expect(makeHeatList(() => 0, R).every(h => h === 85)).toBe(true);
    expect(makeHeatList(() => .99999, R).every(h => h === 115)).toBe(true);
    for (const o of makeOrderList(() => .8, R)) expect(Object.values(o.items).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(4);
    const mixed = { bean: 1, custard: 1, pizza: 1, chocolate: 1 };
    expect(makeOrderList(() => .8, { ...R, firstOrder: mixed })[0]!.items).toEqual(mixed);
  });
  it.each([order({ bean: 2 }), order({ pizza: 1 }), order({ bean: 1, custard: 1, pizza: 1, chocolate: 1 })])('accepts basic, special and four-filling whole orders', issued => {
    let state = createGrill([100], issued, R);
    state.tray = Object.entries(issued.items).flatMap(([filling, count]) => Array.from({ length: count }, (_, id) => ({ id, filling: filling as BreadFilling, front: 80, back: 60, points: 7 })));
    const count = state.tray.length;
    state = run(state, -1, 'DELIVER', 0, { order: 0 });
    expect(state.served).toBe(count); expect(state.tray).toEqual([]); expect(state.orderIndex).toBe(1);
  });
});

it('v4 preview keeps future orders private, issued originals immutable and settlement idempotent without wallet writes', async () => {
  let now = 0;
  const service = createV4PreviewService(() => .5, () => now);
  const game = await service.startGame('same-key');
  expect(await service.startGame('same-key')).toEqual(game); expect(game).not.toHaveProperty('orders');
  game.heats[0] = 85; game.v4!.order.items.bean = 4;
  const original = await service.startGame('same-key');
  expect(original.heats[0]).toBe(100); expect(original.v4!.order.items.bean).toBe(2);
  let played = createGrill(original.heats, first, R);
  played = bake(played, 0, 'bean', 0); played = bake(played, 1, 'bean', 13200);
  played = run(played, -1, 'DELIVER', 26400, { order: 0 });
  const input = { gameId: game.gameId, log: played.log, clientScore: 999, seenTips: [] };
  expect(await service.nextOrder!(input)).toEqual(await service.nextOrder!(input));
  await expect(service.submitResult(input)).rejects.toThrow('60초');
  now = 64000;
  const result = await service.submitResult(input);
  expect(result).toMatchObject({ score: 20, coinsCalculated: 4, coinsGranted: 0 });
  expect(await service.submitResult({ ...input, clientScore: 555 })).toEqual(result);
  await expect(service.balance()).rejects.toThrow('실제 지갑');
});
