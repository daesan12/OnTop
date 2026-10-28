import { expect, it } from 'vitest';
import { CustomerArrivalQueueV5 } from '../../src/features/bungeoppang/customerArrivalV5';
import type { CustomerOrder } from '../../src/features/bungeoppang/rulesV5';

const order = (id: number, slot: number): CustomerOrder => ({ orderId: String(id), customerSlot: slot,
  availableAfterSeq: 0, items: { bean: 2, custard: 0, pizza: 0, chocolate: 0 } });
const initial = [order(1, 0), order(2, 1), order(3, 2)];
const step = (queue: CustomerArrivalQueueV5, t: number, orders = initial) => queue.advance(orders, t, 150000, 180000);

it('starts with one customer and admits others on separate six-second beats', () => {
  const queue = new CustomerArrivalQueueV5(initial);
  expect(step(queue, 0)).toEqual({});
  expect(step(queue, 350)).toEqual({ '1': 350 });
  expect(step(queue, 6349)).toEqual({ '1': 350 });
  expect(step(queue, 6350)).toEqual({ '1': 350, '2': 6350 });
  expect(step(queue, 12350)).toEqual({ '1': 350, '2': 6350, '3': 12350 });
});
it('a replacement waits for both its cooldown and the next beat, even after fast completion', () => {
  const queue = new CustomerArrivalQueueV5(initial);
  step(queue, 350); step(queue, 6350); step(queue, 12350);
  const next = [order(4, 0), initial[1]!, initial[2]!];
  expect(step(queue, 18000, next)['4']).toBeUndefined();
  expect(step(queue, 18350, next)['4']).toBeUndefined();
  expect(step(queue, 20500, next)['4']).toBeUndefined();
  expect(step(queue, 24350, next)['4']).toBe(24350);
});
it('the final thirty seconds bypass the normal beat and fill vacancies continuously', () => {
  const queue = new CustomerArrivalQueueV5(initial);
  step(queue, 350);
  expect(Object.keys(step(queue, 150000))).toEqual(['1', '2']);
  expect(Object.keys(step(queue, 150699))).toEqual(['1', '2']);
  expect(Object.keys(step(queue, 150700))).toEqual(['1', '2', '3']);
  const next = [order(4, 0), initial[1]!, initial[2]!];
  step(queue, 150800, next);
  expect(step(queue, 151400, next)['4']).toBe(151400);
});
it('late frames never release a catch-up crowd or invent orders', () => {
  const queue = new CustomerArrivalQueueV5(initial);
  expect(step(queue, 90000)).toEqual({ '1': 90000 });
  expect(step(queue, 90001)).toEqual({ '1': 90000 });
  expect(step(queue, 96000)).toEqual({ '1': 90000, '2': 96000 });
  expect(step(queue, 180000)['3']).toBeUndefined();
  expect(step(queue, 181000, [])).toEqual({});
});
it('clock jitter around rush start cannot reset the arrival beat', () => {
  const queue = new CustomerArrivalQueueV5(initial);
  step(queue, 350);
  expect(Object.keys(step(queue, 150000))).toEqual(['1', '2']);
  expect(Object.keys(step(queue, 149990))).toEqual(['1', '2']);
  expect(Object.keys(step(queue, 150020))).toEqual(['1', '2']);
  expect(Object.keys(step(queue, 150700))).toEqual(['1', '2', '3']);
});
it('an approved order restored after recovery retains its prior admission', () => {
  const queue = new CustomerArrivalQueueV5(initial);
  step(queue, 350);
  expect(step(queue, 400, initial.slice(1))).toEqual({});
  expect(step(queue, 500)['1']).toBe(350);
});
