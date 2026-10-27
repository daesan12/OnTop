// Pure v4 prediction/replay. Internal FE types, not approved production DTOs.
export interface BungeoppangRules {
  slots: number;
  durationMs: number;
  sideMs: number;
  rushSideMs: number;
  rushFromMs: number;
  heatMin: number;
  heatMax: number;
  heatListLength: number;
  trayCapacity: number;
  maxOrderItems: number;
  orderListLength: number;
  specialOrderChance: number;
  specialBonusPercent: number;
  firstOrder: Readonly<FillingCounts>;
  maxLogEntries: number;
  okFrom: number;
  goldenFrom: number;
  goldenTo: number;
  burntFrom: number;
  okPoint: number;
  goldenPoint: number;
  pointsPerCoin: number;
  dailyCoinCap: number;
  minGapMs: number;
  sameSlotGapMs: number;
}
export const BREAD_FILLINGS = [
  "bean",
  "custard",
  "pizza",
  "chocolate",
] as const;
export type BreadFilling = (typeof BREAD_FILLINGS)[number];
export type BreadTool = "batter" | BreadFilling;
export const BREAD_TOOLS: readonly BreadTool[] = ["batter", ...BREAD_FILLINGS];
export const BREAD_NAMES: Record<BreadTool, string> = {
  batter: "반죽",
  bean: "팥",
  custard: "슈크림",
  pizza: "피자",
  chocolate: "초코",
};
export type FillingCounts = Record<BreadFilling, number>;
export interface BreadOrder {
  /** Server identities are absent only in the explicit local preview. */
  orderId?: string;
  orderIndex?: number;
  items: FillingCounts;
}
export const emptyFillingCounts = (): FillingCounts => ({
  bean: 0,
  custard: 0,
  pizza: 0,
  chocolate: 0,
});
export const orderSize = (order: BreadOrder) =>
  BREAD_FILLINGS.reduce((n, filling) => n + order.items[filling], 0);
export const isSpecialFilling = (filling: BreadFilling) =>
  filling === "pizza" || filling === "chocolate";
export type BreadAction =
  "POUR" | "FILL" | "TURN" | "DISCARD" | "DELIVER" | "TRAY_DISCARD";
export type SlotPhase = "empty" | "batter" | "front" | "back";
export type Judgement = "RAW" | "GOOD" | "PERFECT" | "BURNT";
export type RejectCode =
  | "BAD_ENTRY"
  | "LOG_TOO_LONG"
  | "TIME_REVERSED"
  | "TOO_FAST"
  | "SAME_SLOT_TOO_FAST"
  | "ACTION_STATE_MISMATCH"
  | "TRAY_FULL"
  | "ORDER_NOT_READY"
  | "STALE_ORDER"
  | "TOO_MANY_FILLS";
export interface GrillSlot {
  phase: SlotPhase;
  since: number;
  heat: number;
  filling: BreadFilling | null;
  front: number;
  lastAt: number | null;
}
/** DELIVER uses slot=-1 and the current order index. Other actions use a grill/tray index. */
export interface GrillLogEntry {
  slot: number;
  action: BreadAction;
  t: number;
  filling?: BreadFilling;
  order?: number;
}
export interface TrayBread {
  id: number;
  filling: BreadFilling;
  front: number;
  back: number;
  /** Quality/combo points frozen on take-out; credited only on delivery. */
  points: number;
}
export interface GrillState {
  readonly rulesVersion: 'v4';
  slots: GrillSlot[];
  heats: readonly number[];
  order: BreadOrder | null;
  orderIndex: number;
  tray: TrayBread[];
  fills: number;
  lastAt: number | null;
  score: number;
  combo: number;
  maxCombo: number;
  made: number;
  golden: number;
  failed: number;
  wasted: number;
  served: number;
  customersServed: number;
  specialServed: number;
  bonusScore: number;
  log: GrillLogEntry[];
}
export type GrillEvent =
  | { kind: "pour"; slot: number }
  | { kind: "fill"; slot: number; heat: number; filling: BreadFilling }
  | { kind: "flip"; slot: number; level: number; judgement: Judgement }
  | {
      kind: "takeOut";
      slot: number;
      front: number;
      back: number;
      judgement: Judgement;
      base: number;
      points: number;
      combo: number;
    }
  | { kind: "discard"; slot: number }
  | { kind: "trayDiscard"; slot: number }
  | {
      kind: "deliver";
      slot: null;
      points: number;
      bonus: number;
      count: number;
    };
export interface GrillResult {
  score: number;
  made: number;
  golden: number;
  failed: number;
  wasted: number;
  maxCombo: number;
  coins: number;
  served: number;
  customersServed: number;
  specialServed: number;
  bonusScore: number;
}
export class BungeoppangRuleError extends Error {
  constructor(
    readonly code: RejectCode,
    message: string,
  ) {
    super(message);
  }
}
const reject = (code: RejectCode, message: string): never => {
  throw new BungeoppangRuleError(code, message);
};
const emptySlot = (heat: number, lastAt: number | null = null): GrillSlot => ({
  phase: "empty",
  since: 0,
  heat,
  filling: null,
  front: 0,
  lastAt,
});
export function createGrill(
  heats: readonly number[],
  order: BreadOrder,
  rules: BungeoppangRules,
): GrillState {
  validateOrder(order, rules);
  if (!Array.isArray(heats) || !heats.length || Array.from(heats).some(h => !Number.isInteger(h) || h < rules.heatMin || h > rules.heatMax))
    reject('BAD_ENTRY', '올바르지 않은 불 세기 원본입니다.');
  return {
    rulesVersion: 'v4',
    slots: Array.from({ length: rules.slots }, () =>
      emptySlot(100),
    ),
    heats: [...heats],
    order: { items: { ...order.items } },
    orderIndex: 0,
    tray: [],
    fills: 0,
    lastAt: null,
    score: 0,
    combo: 0,
    maxCombo: 0,
    made: 0,
    golden: 0,
    failed: 0,
    wasted: 0,
    served: 0,
    customersServed: 0,
    specialServed: 0,
    bonusScore: 0,
    log: [],
  };
}
export function validateOrder(order: BreadOrder, rules: BungeoppangRules): void {
  if (!order || !order.items || BREAD_FILLINGS.some(f => !Number.isInteger(order.items[f]) || order.items[f] < 0)
    || orderSize(order) < 1 || orderSize(order) > rules.maxOrderItems)
    reject('BAD_ENTRY', '올바르지 않은 주문입니다.');
}
/** Only the next issued order may fill a delivery's pending slot. */
export function supplyOrder(state: GrillState, index: number, order: BreadOrder, rules: BungeoppangRules): GrillState {
  if (state.order || index !== state.orderIndex) reject('STALE_ORDER', '이미 바뀐 주문입니다.');
  validateOrder(order, rules);
  return { ...state, order: { items: { ...order.items } } };
}
export function cookLevel(
  since: number,
  at: number,
  heat: number,
  rules: BungeoppangRules,
): number {
  const S = rules.sideMs,
    R = rules.rushSideMs;
  const split = Math.min(Math.max(rules.rushFromMs, since), at);
  const normal = Math.max(0, split - since),
    rush = Math.max(0, at - split);
  return Math.floor(
    ((normal * 100 * R + rush * 100 * S) * heat) / (S * R * 100),
  );
}
export function judge(level: number, rules: BungeoppangRules): Judgement {
  if (level >= rules.burntFrom) return "BURNT";
  if (level > rules.goldenTo) return "GOOD";
  if (level >= rules.goldenFrom) return "PERFECT";
  return level >= rules.okFrom ? "GOOD" : "RAW";
}
export function breadBase(
  front: number,
  back: number,
  rules: BungeoppangRules,
): number {
  const sides = [judge(front, rules), judge(back, rules)];
  if (sides.some((j) => j === "RAW" || j === "BURNT")) return 0;
  return sides.reduce(
    (sum, j) => sum + (j === "PERFECT" ? rules.goldenPoint : rules.okPoint),
    0,
  );
}
export function comboPoints(base: number, combo: number): number {
  return Math.floor((base * (combo >= 6 ? 15 : combo >= 3 ? 12 : 10)) / 10);
}
export function actionFor(
  phase: SlotPhase,
  tool: BreadTool,
): BreadAction | "NEED_BATTER" | "NEED_FILLING" {
  if (phase === "empty") return tool === "batter" ? "POUR" : "NEED_BATTER";
  if (phase === "batter") return tool !== "batter" ? "FILL" : "NEED_FILLING";
  return "TURN";
}
export const currentOrder = (state: GrillState) =>
  state.order;
export function trayCounts(state: GrillState): FillingCounts {
  const counts = emptyFillingCounts();
  for (const bread of state.tray) counts[bread.filling]++;
  return counts;
}
/** Match a whole order atomically, oldest matching inventory first. Extra stock stays. */
export function orderReady(state: GrillState): boolean {
  const order = currentOrder(state),
    counts = trayCounts(state);
  return !!order && BREAD_FILLINGS.every((f) => counts[f] >= order.items[f]);
}
export function applyAction(
  state: GrillState,
  entry: GrillLogEntry,
  rules: BungeoppangRules,
): { state: GrillState; event: GrillEvent } {
  if (!entry || typeof entry !== "object")
    reject("BAD_ENTRY", "올바르지 않은 입력입니다.");
  const { slot, action, t } = entry;
  if (
    !Number.isInteger(slot) ||
    !Number.isInteger(t) ||
    t < 0 ||
    t >= rules.durationMs ||
    !["POUR", "FILL", "TURN", "DISCARD", "DELIVER", "TRAY_DISCARD"].includes(
      action,
    ) ||
    (action === "FILL"
      ? !BREAD_FILLINGS.includes(entry.filling!)
      : entry.filling !== undefined) ||
    (action === "DELIVER"
      ? slot !== -1 || !Number.isInteger(entry.order)
      : entry.order !== undefined) ||
    (action !== "DELIVER" &&
      (slot < 0 ||
        slot >= (action === "TRAY_DISCARD" ? state.tray.length : rules.slots)))
  )
    reject("BAD_ENTRY", "올바르지 않은 입력입니다.");
  if (state.log.length >= rules.maxLogEntries)
    reject("LOG_TOO_LONG", "입력 기록이 너무 깁니다.");
  if (state.lastAt !== null && t < state.lastAt)
    reject("TIME_REVERSED", "시간이 거꾸로 간 입력입니다.");
  if (state.lastAt !== null && t - state.lastAt < rules.minGapMs)
    reject("TOO_FAST", "입력 간격이 너무 짧습니다.");
  const next: GrillState = {
    ...state,
    slots: [...state.slots],
    tray: [...state.tray],
    lastAt: t,
    log: [...state.log, { ...entry }],
  };
  if (action === "DELIVER") {
    if (entry.order !== state.orderIndex)
      reject("STALE_ORDER", "이미 바뀐 주문입니다.");
    if (!orderReady(state))
      reject("ORDER_NOT_READY", "주문에 맞는 붕어빵이 부족해요.");
    const needed = { ...currentOrder(state)!.items };
    let points = 0,
      bonus = 0,
      count = 0,
      special = 0;
    next.tray = state.tray.filter((bread) => {
      if (needed[bread.filling] <= 0) return true;
      needed[bread.filling]--;
      count++;
      const extra = isSpecialFilling(bread.filling)
        ? Math.floor((bread.points * rules.specialBonusPercent) / 100)
        : 0;
      points += bread.points + extra;
      bonus += extra;
      if (isSpecialFilling(bread.filling)) special++;
      return false;
    });
    next.orderIndex++;
    next.order = null;
    next.score += points;
    next.bonusScore += bonus;
    next.served += count;
    next.customersServed++;
    next.specialServed += special;
    return {
      state: next,
      event: { kind: "deliver", slot: null, points, bonus, count },
    };
  }
  if (action === "TRAY_DISCARD") {
    next.tray.splice(slot, 1);
    next.wasted++;
    next.combo = 0;
    return { state: next, event: { kind: "trayDiscard", slot } };
  }
  const current = state.slots[slot]!;
  if (current.lastAt !== null && t - current.lastAt < rules.sameSlotGapMs)
    reject("SAME_SLOT_TOO_FAST", "같은 칸을 너무 빨리 눌렀습니다.");
  const allowed: Record<SlotPhase, BreadAction[]> = {
    empty: ["POUR"],
    batter: ["FILL", "DISCARD"],
    front: ["TURN", "DISCARD"],
    back: ["TURN", "DISCARD"],
  };
  if (!allowed[current.phase].includes(action))
    reject("ACTION_STATE_MISMATCH", "칸 상태와 맞지 않는 동작입니다.");
  let event: GrillEvent;
  if (action === "DISCARD") {
    next.slots[slot] = emptySlot(100, t);
    next.wasted++;
    next.combo = 0;
    event = { kind: "discard", slot };
  } else if (action === "POUR") {
    next.slots[slot] = { ...current, phase: "batter", lastAt: t };
    event = { kind: "pour", slot };
  } else if (action === "FILL") {
    if (state.fills >= state.heats.length)
      reject('TOO_MANY_FILLS', '불 세기를 모두 사용했어요. 추가 발급이 필요해요.');
    const heat = state.heats[state.fills]!;
    next.fills++;
    next.slots[slot] = {
      ...current,
      phase: "front",
      since: t,
      heat,
      filling: entry.filling!,
      lastAt: t,
    };
    event = {
      kind: "fill",
      slot,
      heat,
      filling: entry.filling!,
    };
  } else if (current.phase === "front") {
    const level = cookLevel(current.since, t, current.heat, rules);
    next.slots[slot] = {
      ...current,
      phase: "back",
      front: level,
      since: t,
      lastAt: t,
    };
    event = { kind: "flip", slot, level, judgement: judge(level, rules) };
  } else {
    const back = cookLevel(current.since, t, current.heat, rules),
      base = breadBase(current.front, back, rules);
    if (base > 0 && state.tray.length >= rules.trayCapacity)
      reject("TRAY_FULL", "쟁반이 가득 찼어요. 전달하거나 쟁반의 빵을 버려요.");
    const perfect =
      judge(current.front, rules) === "PERFECT" &&
      judge(back, rules) === "PERFECT";
    if (perfect) {
      next.combo++;
      next.golden++;
    } else if (!base) {
      next.combo = 0;
      next.failed++;
    }
    const points = comboPoints(base, next.combo);
    if (base > 0)
      next.tray.push({
        id: state.made + 1,
        filling: current.filling!,
        front: current.front,
        back,
        points,
      });
    next.made++;
    next.maxCombo = Math.max(next.maxCombo, next.combo);
    next.slots[slot] = emptySlot(100, t);
    event = {
      kind: "takeOut",
      slot,
      front: current.front,
      back,
      judgement: judge(back, rules),
      base,
      points,
      combo: next.combo,
    };
  }
  return { state: next, event };
}
export function summarize(
  state: GrillState,
  rules: BungeoppangRules,
): GrillResult {
  const {
    score,
    made,
    golden,
    failed,
    wasted,
    maxCombo,
    served,
    customersServed,
    specialServed,
    bonusScore,
  } = state;
  return {
    score,
    made,
    golden,
    failed,
    wasted,
    maxCombo,
    served,
    customersServed,
    specialServed,
    bonusScore,
    coins: Math.floor(score / rules.pointsPerCoin),
  };
}
export function replayGrill(
  log: readonly GrillLogEntry[],
  heats: readonly number[],
  orders: readonly BreadOrder[],
  rules: BungeoppangRules,
): GrillResult {
  if (!Array.isArray(log)) reject("BAD_ENTRY", "입력 기록이 목록이 아닙니다.");
  if (log.length > rules.maxLogEntries)
    reject("LOG_TOO_LONG", "입력 기록이 너무 깁니다.");
  let state = createGrill(heats, orders[0]!, rules);
  log.forEach((entry, index) => {
    try {
      if (!state.order && orders[state.orderIndex])
        state = supplyOrder(state, state.orderIndex, orders[state.orderIndex]!, rules);
      state = applyAction(state, entry, rules).state;
    } catch (error) {
      if (error instanceof BungeoppangRuleError)
        throw Object.assign(error, { index });
      throw error;
    }
  });
  return summarize(state, rules);
}
/** Mock/test issuer only. Production random issuance belongs to BE. */
export function makeHeatList(random: () => number, rules: BungeoppangRules): number[] {
  const span = rules.heatMax - rules.heatMin + 1;
  return Array.from({ length: rules.heatListLength }, () => rules.heatMin + Math.min(span - 1, Math.max(0, Math.floor(random() * span))));
}
export function grantCoins(
  coins: number,
  earnedToday: number,
  rules: BungeoppangRules,
): number {
  return Math.max(0, Math.min(coins, rules.dailyCoinCap - earnedToday));
}
/** Mock/service-side only. Real order issuance requires the team's approved contract. */
export function makeOrderList(
  random: () => number,
  rules: BungeoppangRules,
): BreadOrder[] {
  validateOrder({ items: { ...rules.firstOrder } }, rules);
  const pick = (n: number) =>
    Math.min(n - 1, Math.max(0, Math.floor(random() * n)));
  return Array.from({ length: rules.orderListLength }, (_, i) => {
    const items = emptyFillingCounts();
    if (i === 0) {
      return { items: { ...rules.firstOrder } };
    }
    const special = random() < rules.specialOrderChance;
    const total = 1 + pick(rules.maxOrderItems);
    if (special) items[pick(2) === 0 ? "pizza" : "chocolate"]++;
    for (let j = special ? 1 : 0; j < total; j++)
      items[BREAD_FILLINGS[pick(special ? 4 : 2)]!]++;
    return { items };
  });
}
