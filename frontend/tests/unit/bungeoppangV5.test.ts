import { describe, expect, it } from 'vitest';
import { BUNGEOPPANG_V5 as R } from '../../src/features/bungeoppang/config';
import { applyAction, burnt, createGrill, ready, replay, validateCustomers, type CustomerOrder } from '../../src/features/bungeoppang/rulesV5';
import { cookLevel, type GrillLogEntry } from '../../src/features/bungeoppang/rulesV4';
import fixture from '../fixtures/bungeoppang-v5.json';

const orders = (): CustomerOrder[] => [
  { orderId: '1', customerSlot: 0, availableAfterSeq: 0, items: { bean: 2, custard: 0, pizza: 0, chocolate: 0 } },
  { orderId: '2', customerSlot: 1, availableAfterSeq: 0, items: { bean: 1, custard: 0, pizza: 0, chocolate: 0 } },
  { orderId: '3', customerSlot: 2, availableAfterSeq: 0, items: { bean: 0, custard: 1, pizza: 0, chocolate: 0 } },
];
const initial = () => createGrill(Array(R.heatListLength).fill(100), orders(), R);
const takeLog: GrillLogEntry[] = [
  { slot: 0, action: 'POUR', t: 0 }, { slot: 0, action: 'FILL', t: 300, filling: 'bean' },
  { slot: 0, action: 'TURN', t: 6400 }, { slot: 0, action: 'TURN', t: 12800 },
];
describe('v5 independent simulation', () => {
  it('keeps batter cold, consumes the heat at FILL and starts the front clock there', () => {
    let s = initial();
    s = applyAction(s, { slot: 0, action: 'POUR', t: 0 }, R).state;
    expect(s.fills).toBe(0); expect(s.slots[0]).toMatchObject({ phase: 'batter', since: 0, heat: 100 });
    s = applyAction(s, { slot: 0, action: 'FILL', t: 2000, filling: 'pizza' }, R).state;
    expect(s.fills).toBe(1); expect(s.slots[0]!.since).toBe(2000);
    const result = applyAction(s, { slot: 0, action: 'TURN', t: 8400 }, R);
    expect(result.event).toMatchObject({ kind: 'flip', level: 80 });
  });
  it.each([85, 100, 115])('uses the assigned %i heat only after filling and keeps it for both sides', heat => {
    let s = createGrill([heat, 100], orders(), R);
    s = applyAction(s, { slot: 0, action: 'POUR', t: 0 }, R).state;
    expect(s.fills).toBe(0); expect(burnt(s.slots[0]!, 100000, R)).toBe(false);
    s = applyAction(s, { slot: 0, action: 'FILL', t: 300, filling: 'bean' }, R).state;
    expect(cookLevel(s.slots[0]!.since, 6700, s.slots[0]!.heat, R)).toBe(Math.floor(heat * .8));
    s = applyAction(s, { slot: 0, action: 'TURN', t: 6700 }, R).state;
    expect(s.slots[0]!.heat).toBe(heat); expect(s.fills).toBe(1);
  });
  it.each(['FILL', 'TURN'] as const)('rejects %s on burned filled bread without changing source', action => {
    const poured = applyAction(initial(), { slot: 0, action: 'POUR', t: 0 }, R).state;
    const s = applyAction(poured, { slot: 0, action: 'FILL', t: 300, filling: 'bean' }, R).state;
    expect(burnt(s.slots[0]!, 8300, R)).toBe(true);
    expect(() => applyAction(s, { slot: 0, action, t: 8300, ...(action === 'FILL' ? { filling: 'bean' as const } : {}) }, R)).toThrow('바로 버려요');
    expect(s.fills).toBe(1); expect(s.log).toHaveLength(2);
  });
  it('batter can wait without burning and discards without consuming a heat or a burn failure', () => {
    const start = applyAction(initial(), { slot: 0, action: 'POUR', t: 0 }, R).state;
    const s = applyAction(start, { slot: 0, action: 'DISCARD', t: 16000 }, R).state;
    expect(s).toMatchObject({ failed: 0, wasted: 1, made: 0, fills: 0, tray: [] });
    expect(applyAction(start, { slot: 0, action: 'FILL', t: 16000, filling: 'bean' }, R).state.slots[0]!.since).toBe(16000);
  });
  it('burned filled bread discards once, adds overlapping waste/failure and never makes a finished bread', () => {
    const poured = applyAction(initial(), { slot: 0, action: 'POUR', t: 0 }, R).state;
    const start = applyAction(poured, { slot: 0, action: 'FILL', t: 300, filling: 'bean' }, R).state;
    const s = applyAction(start, { slot: 0, action: 'DISCARD', t: 8300 }, R).state;
    expect(s).toMatchObject({ failed: 1, wasted: 1, made: 0, score: 0, combo: 0, fills: 1, tray: [] });
    expect(() => applyAction(s, { slot: 0, action: 'DISCARD', t: 8700 }, R)).toThrow();
  });
  it('only successful filling consumes the next heat; pouring, cold discard and rejected actions do not', () => {
    let s = createGrill([85, 115], orders(), R);
    expect(() => applyAction(s, { slot: 0, action: 'FILL', t: 0, filling: 'bean' }, R)).toThrow();
    s = applyAction(s, { slot: 0, action: 'POUR', t: 0 }, R).state;
    s = applyAction(s, { slot: 0, action: 'DISCARD', t: 300 }, R).state;
    s = applyAction(s, { slot: 0, action: 'POUR', t: 600 }, R).state;
    expect(s.fills).toBe(0);
    s = applyAction(s, { slot: 0, action: 'FILL', t: 900, filling: 'bean' }, R).state;
    expect(s.slots[0]!.heat).toBe(85); expect(s.fills).toBe(1);
    s = applyAction(s, { slot: 0, action: 'DISCARD', t: 1200 }, R).state;
    s = applyAction(s, { slot: 0, action: 'POUR', t: 1500 }, R).state;
    s = applyAction(s, { slot: 0, action: 'FILL', t: 1800, filling: 'bean' }, R).state;
    expect(s.slots[0]!.heat).toBe(115); expect(s.fills).toBe(2);
    s = applyAction(s, { slot: 1, action: 'POUR', t: 1850 }, R).state;
    expect(() => applyAction(s, { slot: 1, action: 'FILL', t: 2150, filling: 'bean' }, R)).toThrow('원본');
  });
  it('permits ten stored breads but rejects an eleventh without discarding the cooking bread', () => {
    const s = replay(takeLog.slice(0, 3), initial().heats, orders(), R);
    s.tray = Array.from({ length: 9 }, (_, i) => ({ id: i + 1, filling: 'bean', front: 80, back: 80, points: 10 }));
    s.made = 9;
    const full = applyAction(s, takeLog[3]!, R).state;
    expect(full.tray).toHaveLength(10); expect(full.tray.at(-1)!.id).toBe(10);
    const next = { ...s, tray: full.tray };
    expect(() => applyAction(next, takeLog[3]!, R)).toThrow('10개');
    expect(next.slots[0]!.phase).toBe('back'); expect(next.tray).toHaveLength(10);
  });
  it('discards a burned back even when the tray is full and never turns it', () => {
    const s = replay(takeLog.slice(0, 3), initial().heats, orders(), R);
    s.tray = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, filling: 'bean', front: 80, back: 80, points: 10 }));
    expect(() => applyAction(s, { slot: 0, action: 'TURN', t: 14400 }, R)).toThrow('바로 버려요');
    expect(applyAction(s, { slot: 0, action: 'DISCARD', t: 14400 }, R).state.tray).toHaveLength(10);
  });
  it('serves the second customer first and never reserves shared stock for another order', () => {
    const s = replay(takeLog, initial().heats, orders(), R);
    expect(ready(s, s.activeOrders[1]!)).toBe(true);
    const delivered = applyAction(s, { slot: -1, action: 'DELIVER', t: 12850, orderId: '2' }, R).state;
    expect(delivered.activeOrders.map(o => o.orderId)).toEqual(['1', '3']);
    expect(delivered).toMatchObject({ score: 10, served: 1, customersServed: 1, tray: [] });
    expect(() => applyAction(delivered, { slot: -1, action: 'DELIVER', t: 12900, orderId: '2' }, R)).toThrow();
  });
  it('uses bread identity rather than a stale tray position for discard', () => {
    const s = replay(takeLog, initial().heats, orders(), R);
    expect(applyAction(s, { slot: 9, action: 'TRAY_DISCARD', t: 12850, breadId: 1 }, R).state.tray).toEqual([]);
    expect(() => applyAction(s, { slot: 0, action: 'TRAY_DISCARD', t: 12850, breadId: 99 }, R)).toThrow();
  });
  it('replays replacement issuance at the approved prefix only', () => {
    const replacement = { ...orders()[1]!, orderId: '4', availableAfterSeq: 5 };
    const log = [...takeLog, { slot: -1, action: 'DELIVER' as const, t: 12850, orderId: '2' }];
    expect(replay(log, initial().heats, [...orders(), replacement], R).activeOrders.map(o => o.orderId)).toEqual(['1', '3', '4']);
    expect(() => replay([{ slot: -1, action: 'DELIVER', t: 0, orderId: '4' }], initial().heats, [...orders(), replacement], R)).toThrow();
  });
  it.each([89999, 90000, 119999])('accepts t=%i in the 2-minute interval', t => {
    expect(applyAction(initial(), { slot: 0, action: 'POUR', t }, R).state.log[0]!.t).toBe(t);
  });
  it('rejects t=120000 and handles the rush boundary without rounding each section', () => {
    expect(() => applyAction(initial(), { slot: 0, action: 'POUR', t: 120000 }, R)).toThrow();
    expect(cookLevel(88000, 92000, 100, R)).toBe(58);
  });
  it('rejects duplicate customer slots and more than three active orders', () => {
    expect(() => validateCustomers([...orders(), { ...orders()[0]!, orderId: '4' }], R)).toThrow();
    expect(() => validateCustomers([orders()[0]!, { ...orders()[1]!, customerSlot: 0 }], R)).toThrow();
  });
  it('matches the language-neutral fixture for server implementation', () => {
    const s = replay(fixture.log as GrillLogEntry[], fixture.heats, fixture.orders, R);
    expect(s).toMatchObject(fixture.expected);
  });
});
