import {
  BREAD_FILLINGS, BungeoppangRuleError, breadBase, comboPoints, cookLevel, createGrill as createV4,
  isSpecialFilling, judge, validateOrder,
  type BreadOrder, type BungeoppangRules, type GrillEvent, type GrillLogEntry, type GrillSlot,
  type GrillState as V4State,
} from './rulesV4';

export interface CustomerOrder extends BreadOrder {
  orderId: string;
  customerSlot: number;
  /** A replacement becomes available only after this approved action prefix. */
  availableAfterSeq: number;
}
export interface GrillState extends V4State {
  readonly rulesVersion: 'v5';
  activeOrders: CustomerOrder[];
  complainedOrderIds: string[];
}
export const isV5Grill = (grill: V4State | null | undefined): grill is GrillState => grill?.rulesVersion === 'v5';
const reject = (code: ConstructorParameters<typeof BungeoppangRuleError>[0], message: string): never => {
  throw new BungeoppangRuleError(code, message);
};
const empty = (lastAt: number | null = null): GrillSlot =>
  ({ phase: 'empty', since: 0, heat: 100, filling: null, front: 0, lastAt });

export function validateCustomers(orders: readonly CustomerOrder[], rules: BungeoppangRules) {
  if (!Array.isArray(orders) || orders.length > 3) reject('BAD_ENTRY', '손님은 최대 세 명이에요.');
  const ids = new Set<string>(), places = new Set<number>();
  for (const order of orders) {
    validateOrder(order, rules);
    if (!/^[1-9]\d{0,18}$/.test(order.orderId) || !Number.isInteger(order.customerSlot)
      || order.customerSlot < 0 || order.customerSlot > 2 || !Number.isSafeInteger(order.availableAfterSeq)
      || order.availableAfterSeq < 0 || ids.has(order.orderId) || places.has(order.customerSlot))
      reject('BAD_ENTRY', '손님 주문 식별자를 확인해 주세요.');
    ids.add(order.orderId); places.add(order.customerSlot);
  }
}
export function createGrill(heats: readonly number[], orders: readonly CustomerOrder[], rules: BungeoppangRules): GrillState {
  validateCustomers(orders, rules);
  if (!orders.length || orders.some(o => o.availableAfterSeq !== 0)) reject('BAD_ENTRY', '처음 손님 주문이 필요해요.');
  return { ...createV4(heats, orders[0]!, rules), rulesVersion: 'v5', order: null,
    activeOrders: orders.map(o => ({ ...o, items: { ...o.items } })), complainedOrderIds: [] };
}
/** 발급 ID 간격 대신 승인된 제공 순서로 실제 도착 순서를 계산한다. */
export function arrivalIndex(order: CustomerOrder, log: readonly GrillLogEntry[]) {
  return order.availableAfterSeq === 0 ? order.customerSlot
    : 2 + log.slice(0, order.availableAfterSeq).filter(entry => entry.action === 'DELIVER').length;
}
export function ready(state: GrillState, order: CustomerOrder) {
  return BREAD_FILLINGS.every(f => state.tray.filter(b => b.filling === f).length >= order.items[f]);
}
export function burnt(slot: GrillSlot, t: number, rules: BungeoppangRules) {
  return (slot.phase === 'front' || slot.phase === 'back')
    && (slot.front >= rules.burntFrom || cookLevel(slot.since, t, slot.heat, rules) >= rules.burntFrom);
}
/** State is authoritative simulation data; selection and animation live outside the replay. */
export function applyAction(state: GrillState, entry: GrillLogEntry, rules: BungeoppangRules): { state: GrillState; event: GrillEvent } {
  const { action, slot, t } = entry;
  const trayIndex = action === 'TRAY_DISCARD' ? state.tray.findIndex(b => b.id === entry.breadId) : -1;
  if (!Number.isInteger(t) || t < 0 || t >= rules.durationMs || !Number.isInteger(slot)
    || !['POUR', 'FILL', 'TURN', 'DISCARD', 'TRAY_DISCARD', 'DELIVER'].includes(action)
    || (action === 'DELIVER' ? slot !== -1 || !entry.orderId : entry.orderId !== undefined)
    || (action === 'TRAY_DISCARD' ? trayIndex < 0 : entry.breadId !== undefined)
    || (action === 'FILL' ? !BREAD_FILLINGS.includes(entry.filling!) : entry.filling !== undefined)
    || entry.order !== undefined
    || (!['TRAY_DISCARD', 'DELIVER'].includes(action) && (slot < 0 || slot >= rules.slots)))
    reject('BAD_ENTRY', '올바르지 않은 v5 입력이에요.');
  if (state.log.length >= rules.maxLogEntries) reject('LOG_TOO_LONG', '입력 기록 한도에 도달했어요.');
  if (state.lastAt !== null && t < state.lastAt) reject('TIME_REVERSED', '시간이 거꾸로 간 입력이에요.');
  if (state.lastAt !== null && t - state.lastAt < rules.minGapMs) reject('TOO_FAST', '입력 간격이 너무 짧아요.');
  const next: GrillState = { ...state, slots: [...state.slots], tray: [...state.tray],
    activeOrders: [...state.activeOrders], log: [...state.log, { ...entry }], lastAt: t };
  if (action === 'DELIVER') {
    const order = state.activeOrders.find(o => o.orderId === entry.orderId);
    if (!order || order.availableAfterSeq > state.log.length) reject('STALE_ORDER', '이미 바뀐 손님 주문이에요.');
    if (!ready(state, order!)) reject('ORDER_NOT_READY', '선택한 손님에게 줄 붕어빵이 부족해요.');
    const needed = { ...order!.items };
    let points = 0, bonus = 0, count = 0, special = 0;
    next.tray = state.tray.filter(b => {
      if (!needed[b.filling]) return true;
      needed[b.filling]--; count++;
      const extra = isSpecialFilling(b.filling) ? Math.floor(b.points * rules.specialBonusPercent / 100) : 0;
      points += b.points + extra; bonus += extra; special += Number(isSpecialFilling(b.filling));
      return false;
    });
    next.activeOrders = state.activeOrders.filter(o => o.orderId !== order!.orderId);
    const complaints = (rules.queueComplaintPenalty ?? 0) > 0 ? next.activeOrders.filter(waiting =>
      !state.complainedOrderIds.includes(waiting.orderId)
      && arrivalIndex(order!, state.log) - arrivalIndex(waiting, state.log) >= 3) : [];
    next.complainedOrderIds = [...state.complainedOrderIds, ...complaints.map(waiting => waiting.orderId)];
    next.score += points - complaints.length * (rules.queueComplaintPenalty ?? 0);
    next.bonusScore += bonus; next.served += count;
    next.specialServed += special; next.customersServed++; next.orderIndex++;
    return { state: next, event: { kind: 'deliver', slot: null, points, bonus, count } };
  }
  if (action === 'TRAY_DISCARD') {
    next.tray.splice(trayIndex, 1); next.wasted++; next.combo = 0;
    return { state: next, event: { kind: 'trayDiscard', slot: trayIndex } };
  }
  const current = state.slots[slot]!;
  if (current.lastAt !== null && t - current.lastAt < rules.sameSlotGapMs)
    reject('SAME_SLOT_TOO_FAST', '같은 칸을 너무 빨리 눌렀어요.');
  const allowed = { empty: ['POUR'], batter: ['FILL', 'DISCARD'], front: ['TURN', 'DISCARD'], back: ['TURN', 'DISCARD'] };
  if ((action === 'FILL' || action === 'TURN') && burnt(current, t, rules))
    reject('ACTION_STATE_MISMATCH', '탄 붕어빵은 뒤집지 않고 바로 버려요.');
  if (!allowed[current.phase].includes(action)) reject('ACTION_STATE_MISMATCH', '칸 상태에 맞지 않는 조작이에요.');
  let event: GrillEvent;
  if (action === 'POUR') {
    next.slots[slot] = { ...empty(t), phase: 'batter' };
    event = { kind: 'pour', slot };
  } else if (action === 'FILL') {
    if (state.fills >= state.heats.length) reject('TOO_MANY_FILLS', '서버 불 원본이 부족해요.');
    const heat = state.heats[state.fills]!;
    next.slots[slot] = { ...current, phase: 'front', filling: entry.filling!, since: t, heat, lastAt: t };
    next.fills++; event = { kind: 'fill', slot, heat, filling: entry.filling! };
  } else if (action === 'DISCARD') {
    if (burnt(current, t, rules)) next.failed++;
    next.slots[slot] = empty(t); next.wasted++; next.combo = 0;
    event = { kind: 'discard', slot };
  } else if (current.phase === 'front') {
    const level = cookLevel(current.since, t, current.heat, rules);
    next.slots[slot] = { ...current, phase: 'back', front: level, since: t, lastAt: t };
    event = { kind: 'flip', slot, level, judgement: judge(level, rules) };
  } else {
    const back = cookLevel(current.since, t, current.heat, rules), base = breadBase(current.front, back, rules);
    if (base && state.tray.length >= rules.trayCapacity) reject('TRAY_FULL', '쟁반 10개가 가득 찼어요. 전달하거나 버려요.');
    if (judge(current.front, rules) === 'PERFECT' && judge(back, rules) === 'PERFECT') { next.combo++; next.golden++; }
    else if (!base) { next.combo = 0; next.failed++; }
    const points = comboPoints(base, next.combo);
    next.made++;
    if (base) next.tray.push({ id: next.made, filling: current.filling!, front: current.front, back, points });
    next.maxCombo = Math.max(next.maxCombo, next.combo); next.slots[slot] = empty(t);
    event = { kind: 'takeOut', slot, front: current.front, back, base, points, combo: next.combo, judgement: judge(back, rules) };
  }
  return { state: next, event };
}
/** Issuance history is server-owned; replacements cannot appear before their approval prefix. */
export function replay(log: readonly GrillLogEntry[], heats: readonly number[], history: readonly CustomerOrder[], rules: BungeoppangRules): GrillState {
  if (log.length > rules.maxLogEntries) reject('LOG_TOO_LONG', '입력 기록 한도에 도달했어요.');
  let state = createGrill(heats, history.filter(o => o.availableAfterSeq === 0), rules);
  for (const entry of log) {
    state = applyAction(state, entry, rules).state;
    const issued = history.filter(o => o.availableAfterSeq === state.log.length);
    if (issued.length) {
      const activeOrders = [...state.activeOrders, ...issued];
      validateCustomers(activeOrders, rules); state = { ...state, activeOrders };
    }
  }
  return state;
}
