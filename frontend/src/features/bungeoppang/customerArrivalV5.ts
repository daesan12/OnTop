import { create } from 'zustand';
import type { CustomerOrder } from './rulesV5';
import { useCustomerSpeechV5 } from './customerSpeechV5';
import { resetCustomerDeparturesV5, useCustomerDeparturesV5 } from './customerDepartureV5';

export const CUSTOMER_ARRIVAL = { firstMs: 350, normalMs: 6000, replacementWaitMs: 2500, rushMs: 700, rushWaitMs: 200 } as const;
type Visit = { seenAt: number; initial: boolean; admittedAt: number | null; slot: number };

/** Presentation cadence for approved orders. Missed beats never create a catch-up crowd. */
export class CustomerArrivalQueueV5 {
  private visits = new Map<string, Visit>();
  private nextAt: number = CUSTOMER_ARRIVAL.firstMs;
  private rush = false;
  private lastT = 0;
  constructor(initial: readonly CustomerOrder[] = []) {
    initial.forEach(order => this.visits.set(order.orderId, { seenAt: 0, initial: true, admittedAt: null, slot: order.customerSlot }));
  }
  advance(orders: readonly CustomerOrder[], t: number, rushFromMs: number, durationMs: number, occupied: readonly number[] = []) {
    // RAF timestamps and the interval fallback can arrive a few milliseconds out of order.
    t = this.lastT = Math.max(this.lastT, t);
    for (const order of orders) if (!this.visits.has(order.orderId)) {
      this.visits.set(order.orderId, { seenAt: t, initial: false, admittedAt: null, slot: order.customerSlot });
    }
    const rush = t >= rushFromMs;
    if (rush && !this.rush) this.nextAt = Math.min(this.nextAt, t);
    this.rush = rush;
    if (t >= 0 && t < durationMs && t >= this.nextAt) {
      this.nextAt = t + (rush ? CUSTOMER_ARRIVAL.rushMs : CUSTOMER_ARRIVAL.normalMs);
      const waiting = orders.map(order => ({ id: order.orderId, visit: this.visits.get(order.orderId)! }))
        .filter(({ visit }) => visit.admittedAt === null && !occupied.includes(visit.slot) && t >= visit.seenAt +
          (visit.initial ? 0 : rush ? CUSTOMER_ARRIVAL.rushWaitMs : CUSTOMER_ARRIVAL.replacementWaitMs))
        .sort((a, b) => a.visit.seenAt - b.visit.seenAt || a.visit.slot - b.visit.slot);
      if (waiting[0]) waiting[0].visit.admittedAt = t;
    }
    return Object.fromEntries(orders.flatMap(order => {
      const at = this.visits.get(order.orderId)!.admittedAt;
      return at === null ? [] : [[order.orderId, at]];
    })) as Record<string, number>;
  }
}

let queue = new CustomerArrivalQueueV5();
export const useCustomerArrivalsV5 = create<{ admitted: Record<string, number> }>(() => ({ admitted: {} }));
export function resetCustomerArrivalsV5(initial: readonly CustomerOrder[] = []) {
  resetCustomerDeparturesV5();
  queue = new CustomerArrivalQueueV5(initial);
  useCustomerArrivalsV5.setState({ admitted: {} });
}
export function advanceCustomerArrivalsV5(orders: readonly CustomerOrder[], t: number, rushFromMs: number, durationMs: number) {
  const occupied = Object.values(useCustomerDeparturesV5.getState().visits).map(visit => visit.order.customerSlot);
  const admitted = queue.advance(orders, t, rushFromMs, durationMs, occupied), previous = useCustomerArrivalsV5.getState().admitted;
  if (Object.keys(admitted).length !== Object.keys(previous).length || Object.keys(admitted).some(id => admitted[id] !== previous[id]))
    useCustomerArrivalsV5.setState({ admitted });
}
export function canUseCustomerOrderV5(orderId: string | null) {
  if (!orderId || useCustomerArrivalsV5.getState().admitted[orderId] === undefined) return false;
  const stage = useCustomerSpeechV5.getState().stages[orderId];
  return stage === 'request' || stage === 'summary';
}
