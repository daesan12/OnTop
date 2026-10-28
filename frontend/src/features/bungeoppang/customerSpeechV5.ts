import { create } from 'zustand';
import { BREAD_FILLINGS, BREAD_NAMES } from './rulesV4';
import type { CustomerOrder } from './rulesV5';
import { CustomerDialogueDeckV5, type CustomerDialogueV5 } from './customerDialogueV5';

export type CustomerSpeechStage = 'waiting' | 'greeting' | 'request' | 'summary';
const sequence: CustomerSpeechStage[] = ['waiting', 'greeting', 'request', 'summary'];
export const CUSTOMER_GREETING_MS = 1300;
const clouds = new Map<string, HTMLElement>();
export function registerCustomerCloudV5(orderId: string, element: HTMLElement | null) {
  if (element) clouds.set(orderId, element); else clouds.delete(orderId);
}
export function moveCustomerCloudV5(orderId: string, x: number, y: number) {
  const element = clouds.get(orderId);
  if (!element) return;
  for (const [axis, value] of [['x', x], ['y', y]] as const) {
    const name = `--customer-offset-${axis}`, next = `${value.toFixed(1)}px`;
    if (element.style.getPropertyValue(name) !== next) element.style.setProperty(name, next);
  }
}

/** Local visit presentation only; it never changes the order or replay clock. */
const dialogueDeck = new CustomerDialogueDeckV5();
export const useCustomerSpeechV5 = create<{
  stages: Record<string, CustomerSpeechStage>;
  dialogues: Record<string, CustomerDialogueV5>;
}>(() => ({ stages: {}, dialogues: {} }));
export function beginCustomerSpeechV5(orderId: string) {
  if (useCustomerSpeechV5.getState().stages[orderId] !== undefined) return;
  const dialogue = dialogueDeck.next(orderId);
  useCustomerSpeechV5.setState(s => ({ stages: { ...s.stages, [orderId]: 'waiting' },
    dialogues: { ...s.dialogues, [orderId]: dialogue } }));
}
export function advanceCustomerSpeechV5(orderId: string, stage: CustomerSpeechStage) {
  const current = useCustomerSpeechV5.getState().stages[orderId];
  if (current === undefined || sequence.indexOf(stage) <= sequence.indexOf(current)) return;
  useCustomerSpeechV5.setState(s => ({ stages: { ...s.stages, [orderId]: stage } }));
}
export function endCustomerSpeechV5(orderId: string) {
  useCustomerSpeechV5.setState(s => {
    const stages = { ...s.stages }, dialogues = { ...s.dialogues };
    delete stages[orderId]; delete dialogues[orderId]; return { stages, dialogues };
  });
}
export function customerRequestText(items: CustomerOrder['items'], template = '{order} 주세요!') {
  const fillings = BREAD_FILLINGS.filter(f => items[f] > 0);
  const order = fillings.map(f => `${BREAD_NAMES[f]}${fillings.length === 1 ? ' 붕어빵' : ''} ${items[f]}개`).join(', ');
  return template.replace('{order}', order);
}
export function customerRequestDuration(items: CustomerOrder['items'], template?: string) {
  return Math.max(2200 + BREAD_FILLINGS.filter(f => items[f] > 0).length * 450,
    customerRequestText(items, template).length * 85);
}
