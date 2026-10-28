import { afterEach, expect, it } from 'vitest';
import { CUSTOMER_ASSETS_V5 } from '../../src/features/bungeoppang/customerAssetsV5';
import { CUSTOMER_DIALOGUE_V5, CustomerDialogueDeckV5 } from '../../src/features/bungeoppang/customerDialogueV5';
import { advanceCustomerSpeechV5, beginCustomerSpeechV5, customerRequestDuration, customerRequestText,
  endCustomerSpeechV5, useCustomerSpeechV5 } from '../../src/features/bungeoppang/customerSpeechV5';

afterEach(() => useCustomerSpeechV5.setState({ stages: {}, dialogues: {} }));

it.each(CUSTOMER_ASSETS_V5.map((asset, i) => ({ ...asset, orderId: String(i + 1) })))
  ('$name gets six greetings and six requests without repeats, including across bag boundaries', ({ id, orderId }) => {
    const deck = new CustomerDialogueDeckV5(() => .4), profile = CUSTOMER_DIALOGUE_V5[id];
    const visits = Array.from({ length: 18 }, () => deck.next(orderId));
    for (let start = 0; start < visits.length; start += 6) {
      const batch = visits.slice(start, start + 6);
      expect(new Set(batch.map(v => v.greeting))).toEqual(new Set(profile.greetings));
      expect(new Set(batch.map(v => v.request))).toEqual(new Set(profile.requests));
    }
    for (let i = 1; i < visits.length; i++) {
      expect(visits[i]!.greeting).not.toBe(visits[i - 1]!.greeting);
      expect(visits[i]!.request).not.toBe(visits[i - 1]!.request);
    }
  });

it('uses randomness and independent character bags, even with very large server IDs', () => {
  expect(new CustomerDialogueDeckV5(() => 0).next('1')).not.toEqual(new CustomerDialogueDeckV5(() => .999).next('1'));
  const deck = new CustomerDialogueDeckV5(() => .4), control = new CustomerDialogueDeckV5(() => .4);
  expect(deck.next('1')).toEqual(control.next('1'));
  for (let i = 0; i < 10; i++) deck.next('2');
  expect(deck.next('9007199254740997')).toEqual(control.next('7')); // Both are the red-scarf boy.
});

it('every request template preserves actual single and mixed fillings and allows enough reading time', () => {
  const single = { bean: 2, custard: 0, pizza: 0, chocolate: 0 };
  const mixed = { bean: 2, custard: 1, pizza: 3, chocolate: 1 };
  for (const profile of Object.values(CUSTOMER_DIALOGUE_V5)) for (const template of profile.requests) {
    expect(template.match(/\{order\}/g)).toHaveLength(1);
    const one = customerRequestText(single, template), all = customerRequestText(mixed, template);
    expect(one).toContain('팥 붕어빵 2개');
    expect(one).not.toMatch(/슈크림|피자|초코|\{order\}/);
    expect(all).toContain('팥 2개, 슈크림 1개, 피자 3개, 초코 1개');
    expect(all).not.toContain('{order}');
    expect(customerRequestDuration(mixed, template)).toBeGreaterThanOrEqual(all.length * 85);
  }
  expect(single.bean).toBe(2);
  expect(customerRequestText(single)).toBe('팥 붕어빵 2개 주세요!');
});

it('keeps dialogue fixed throughout one visit and removes it on departure', () => {
  beginCustomerSpeechV5('1');
  const first = useCustomerSpeechV5.getState().dialogues['1'];
  advanceCustomerSpeechV5('1', 'request');
  beginCustomerSpeechV5('1');
  expect(useCustomerSpeechV5.getState().dialogues['1']).toBe(first);
  expect(useCustomerSpeechV5.getState().stages['1']).toBe('request');
  endCustomerSpeechV5('1');
  expect(useCustomerSpeechV5.getState()).toEqual({ stages: {}, dialogues: {} });
  beginCustomerSpeechV5('7');
  expect(useCustomerSpeechV5.getState().dialogues['7']!.greeting).not.toBe(first!.greeting);
  expect(useCustomerSpeechV5.getState().dialogues['7']!.request).not.toBe(first!.request);
});
