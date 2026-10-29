import { create } from 'zustand';
import type { CustomerOrder } from './rulesV5';
import { beginCustomerSpeechV5, useCustomerSpeechV5 } from './customerSpeechV5';

export const CUSTOMER_RECEIVE_MS = 450;
export const CUSTOMER_LEAVE_MS = 1100;
export type CustomerDepartureV5 = {
  order: CustomerOrder;
  phase: 'pending' | 'receiving' | 'thanks' | 'leaving';
  approvedAt: number;
  thanks: string;
  thanksMs: number;
};
export const useCustomerDeparturesV5 = create<{ visits: Record<string, CustomerDepartureV5> }>(() => ({ visits: {} }));

/** Preserve the same actor while the server checks delivery. A pending visit never says thanks. */
export function holdCustomerDepartureV5(order: CustomerOrder) {
  if (useCustomerDeparturesV5.getState().visits[order.orderId]) return;
  beginCustomerSpeechV5(order.orderId);
  const thanks = useCustomerSpeechV5.getState().dialogues[order.orderId]!.thanks;
  useCustomerDeparturesV5.setState(s => ({ visits: { ...s.visits, [order.orderId]: {
    order, phase: 'pending', approvedAt: 0, thanks, thanksMs: Math.max(2600, thanks.length * 90),
  } } }));
}
export function approveCustomerDepartureV5(order: CustomerOrder, now = performance.now()) {
  holdCustomerDepartureV5(order);
  const visit = useCustomerDeparturesV5.getState().visits[order.orderId]!;
  if (visit.phase !== 'pending') return;
  useCustomerDeparturesV5.setState(s => ({ visits: { ...s.visits,
    [order.orderId]: { ...visit, phase: 'receiving', approvedAt: now } } }));
}
export function advanceCustomerDeparturesV5(now = performance.now()) {
  const previous = useCustomerDeparturesV5.getState().visits;
  let visits = previous;
  for (const [id, visit] of Object.entries(previous)) {
    if (visit.phase === 'pending') continue;
    const age = now - visit.approvedAt, leaveAt = CUSTOMER_RECEIVE_MS + visit.thanksMs;
    if (age >= leaveAt + CUSTOMER_LEAVE_MS) {
      if (visits === previous) visits = { ...previous };
      delete visits[id];
    } else {
      const phase = age >= leaveAt ? 'leaving' : age >= CUSTOMER_RECEIVE_MS ? 'thanks' : 'receiving';
      // RAF and interval timestamps can arrive slightly out of order.
      if (phase !== visit.phase && !(visit.phase === 'leaving' || visit.phase === 'thanks' && phase === 'receiving')) {
        if (visits === previous) visits = { ...previous };
        visits[id] = { ...visit, phase };
      }
    }
  }
  if (visits !== previous) useCustomerDeparturesV5.setState({ visits });
}
export function cancelPendingCustomerDeparturesV5() {
  useCustomerDeparturesV5.setState(s => ({ visits: Object.fromEntries(
    Object.entries(s.visits).filter(([, visit]) => visit.phase !== 'pending')) }));
}
export function resetCustomerDeparturesV5() { useCustomerDeparturesV5.setState({ visits: {} }); }
