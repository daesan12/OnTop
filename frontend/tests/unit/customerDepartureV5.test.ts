import { afterEach, expect, it } from 'vitest';
import { CUSTOMER_DIALOGUE_V5 } from '../../src/features/bungeoppang/customerDialogueV5';
import { CUSTOMER_LEAVE_MS, CUSTOMER_RECEIVE_MS, advanceCustomerDeparturesV5, approveCustomerDepartureV5,
  cancelPendingCustomerDeparturesV5, holdCustomerDepartureV5, resetCustomerDeparturesV5,
  useCustomerDeparturesV5 } from '../../src/features/bungeoppang/customerDepartureV5';
import { useCustomerSpeechV5 } from '../../src/features/bungeoppang/customerSpeechV5';
import { CustomerArrivalQueueV5, resetCustomerArrivalsV5 } from '../../src/features/bungeoppang/customerArrivalV5';
import type { CustomerOrder } from '../../src/features/bungeoppang/rulesV5';

const order = (orderId = '1', customerSlot = 0): CustomerOrder => ({ orderId, customerSlot, availableAfterSeq: 0,
  items: { bean: 2, custard: 0, pizza: 0, chocolate: 0 } });
const visits = () => useCustomerDeparturesV5.getState().visits;
afterEach(() => { resetCustomerDeparturesV5(); useCustomerSpeechV5.setState({ stages: {}, dialogues: {} }); });

it('holds the same customer through network delays without claiming delivery success', () => {
  holdCustomerDepartureV5(order());
  const first = visits()['1']!;
  expect(first.phase).toBe('pending');
  expect(CUSTOMER_DIALOGUE_V5['boy-red-scarf'].thanks).toContain(first.thanks);
  holdCustomerDepartureV5(order()); advanceCustomerDeparturesV5(1e9);
  expect(visits()['1']).toBe(first);
});
it('waits for receipt, keeps the chosen thanks readable, then leaves and removes the visit', () => {
  approveCustomerDepartureV5(order(), 1000);
  const first = visits()['1']!;
  expect(first.phase).toBe('receiving');
  advanceCustomerDeparturesV5(1000 + CUSTOMER_RECEIVE_MS - 1);
  expect(visits()['1']!.phase).toBe('receiving');
  advanceCustomerDeparturesV5(1000 + CUSTOMER_RECEIVE_MS);
  expect(visits()['1']!.phase).toBe('thanks');
  expect(first.thanksMs).toBeGreaterThanOrEqual(first.thanks.length * 90);
  const leaveAt = 1000 + CUSTOMER_RECEIVE_MS + first.thanksMs;
  advanceCustomerDeparturesV5(leaveAt - 1); expect(visits()['1']!.phase).toBe('thanks');
  advanceCustomerDeparturesV5(leaveAt); expect(visits()['1']!.phase).toBe('leaving');
  expect(visits()['1']!.thanks).toBe(first.thanks);
  advanceCustomerDeparturesV5(leaveAt + CUSTOMER_LEAVE_MS); expect(visits()).toEqual({});
});
it('does not reroll or restart an approved visit on duplicate acknowledgements or jitter', () => {
  approveCustomerDepartureV5(order(), 1000);
  const first = visits()['1']!;
  approveCustomerDepartureV5(order(), 9000); expect(visits()['1']).toBe(first);
  advanceCustomerDeparturesV5(1000 + CUSTOMER_RECEIVE_MS);
  advanceCustomerDeparturesV5(1000 + CUSTOMER_RECEIVE_MS - 10);
  expect(visits()['1']!.phase).toBe('thanks');
});
it('recovery cancels only pending visits, while round reset clears all reserved places', () => {
  holdCustomerDepartureV5(order()); approveCustomerDepartureV5(order('2', 1), 1000);
  cancelPendingCustomerDeparturesV5(); expect(Object.keys(visits())).toEqual(['2']);
  resetCustomerArrivalsV5(); expect(visits()).toEqual({});
});
it('rush arrivals wait until the previous guest finishes thanking and leaving', () => {
  const first = order(), replacement = order('7'), queue = new CustomerArrivalQueueV5([first]);
  queue.advance([first], 350, 90000, 120000);
  expect(queue.advance([replacement], 90000, 90000, 120000, [0])).toEqual({});
  expect(queue.advance([replacement], 90700, 90000, 120000, [0])).toEqual({});
  expect(queue.advance([replacement], 91400, 90000, 120000, [])).toEqual({ '7': 91400 });
});
