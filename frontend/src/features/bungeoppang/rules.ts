// Pure rules: no renderer, sockets, clock, identity or currency.
// 붕어빵 뒤집기 규칙 v2. 클라이언트 진행과 서버 재계산이 같은 결과를 내도록 정수 연산만 쓴다.
export interface BungeoppangRules {
  slots: number;
  durationMs: number;
  sideMs: number;
  rushSideMs: number;
  rushFromMs: number;
  heatMin: number;
  heatMax: number;
  heatListLength: number;
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
export type BreadAction = "POUR" | "FILL" | "TURN" | "DISCARD";
export type SlotPhase = "empty" | "batter" | "front" | "back";
export type Judgement = "RAW" | "GOOD" | "PERFECT" | "BURNT";
/** 손에 든 재료. 기록과 점수에는 들어가지 않는 화면 상태다. */
export type BreadTool = "batter" | "bean";
export type RejectCode =
  | "BAD_ENTRY"
  | "LOG_TOO_LONG"
  | "TIME_REVERSED"
  | "TOO_FAST"
  | "SAME_SLOT_TOO_FAST"
  | "ACTION_STATE_MISMATCH"
  | "TOO_MANY_FILLS";

export interface GrillSlot {
  phase: SlotPhase;
  /** 지금 굽는 면이 불에 닿은 게임 시각(ms). */
  since: number;
  heat: number;
  /** 뒤집을 때 고정된 앞면 익힘. */
  front: number;
  /** 이 칸에서 마지막으로 동작이 일어난 게임 시각. */
  lastAt: number | null;
}
export interface GrillLogEntry {
  slot: number;
  action: BreadAction;
  t: number;
}
export interface GrillState {
  slots: GrillSlot[];
  heats: readonly number[];
  fills: number;
  lastAt: number | null;
  score: number;
  combo: number;
  maxCombo: number;
  made: number;
  golden: number;
  failed: number;
  wasted: number;
  log: GrillLogEntry[];
}
export type GrillEvent =
  | { kind: "pour"; slot: number }
  | { kind: "fill"; slot: number; heat: number }
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
  | { kind: "discard"; slot: number };
export interface GrillResult {
  score: number;
  made: number;
  golden: number;
  failed: number;
  wasted: number;
  maxCombo: number;
  coins: number;
}

export class BungeoppangRuleError extends Error {
  constructor(
    readonly code: RejectCode,
    message: string,
  ) {
    super(message);
  }
}

const emptySlot = (lastAt: number | null = null): GrillSlot => ({
  phase: "empty",
  since: 0,
  heat: 100,
  front: 0,
  lastAt,
});

export function createGrill(
  heats: readonly number[],
  rules: BungeoppangRules,
): GrillState {
  return {
    slots: Array.from({ length: rules.slots }, () => emptySlot()),
    heats: [...heats],
    fills: 0,
    lastAt: null,
    score: 0,
    combo: 0,
    maxCombo: 0,
    made: 0,
    golden: 0,
    failed: 0,
    wasted: 0,
    log: [],
  };
}

/**
 * 익힘 = 내림((평소 시간 × 100 × R + 몰림 시간 × 100 × S) × 불 세기 ÷ (S × R × 100)).
 * 분자 최댓값은 약 5.5e12라 Number로도 정확하다.
 */
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
  if (level >= rules.okFrom) return "GOOD";
  return "RAW";
}

/** 양면 점수 합. 한 면이라도 RAW·BURNT면 0이므로 결과는 0, 4, 7, 10 중 하나다. */
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

/** 콤보 3~5는 ×1.2, 6 이상은 ×1.5. 정수 나눗셈으로 내림한다. */
export function comboPoints(base: number, combo: number): number {
  if (combo >= 6) return Math.floor((base * 15) / 10);
  if (combo >= 3) return Math.floor((base * 12) / 10);
  return base;
}

/** 칸 상태와 손에 든 재료로 누르기가 어떤 동작이 되는지. 재료가 맞지 않으면 안내 키를 돌려준다. */
export function actionFor(
  phase: SlotPhase,
  tool: BreadTool,
): BreadAction | "NEED_BATTER" | "NEED_BEAN" {
  if (phase === "empty") return tool === "batter" ? "POUR" : "NEED_BATTER";
  if (phase === "batter") return tool === "bean" ? "FILL" : "NEED_BEAN";
  return "TURN";
}

const reject = (code: RejectCode, message: string): never => {
  throw new BungeoppangRuleError(code, message);
};

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
    slot < 0 ||
    slot >= rules.slots ||
    !["POUR", "FILL", "TURN", "DISCARD"].includes(action) ||
    !Number.isInteger(t) ||
    t < 0 ||
    t > rules.durationMs
  )
    reject("BAD_ENTRY", "올바르지 않은 입력입니다.");
  if (state.lastAt !== null && t < state.lastAt)
    reject("TIME_REVERSED", "시간이 거꾸로 간 입력입니다.");
  if (state.lastAt !== null && t - state.lastAt < rules.minGapMs)
    reject("TOO_FAST", "입력 간격이 너무 짧습니다.");
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
  if (action === "FILL" && state.fills >= state.heats.length)
    reject("TOO_MANY_FILLS", "불 세기 목록을 모두 사용했습니다.");

  const next: GrillState = {
    ...state,
    slots: [...state.slots],
    lastAt: t,
    log: [...state.log, { slot, action, t }],
  };
  let event: GrillEvent;
  if (action === "DISCARD") {
    next.slots[slot] = emptySlot(t);
    next.wasted += 1;
    next.combo = 0;
    event = { kind: "discard", slot };
  } else if (action === "POUR") {
    next.slots[slot] = { ...current, phase: "batter", lastAt: t };
    event = { kind: "pour", slot };
  } else if (action === "FILL") {
    const heat = state.heats[state.fills]!;
    next.fills += 1;
    next.slots[slot] = {
      ...current,
      phase: "front",
      since: t,
      heat,
      lastAt: t,
    };
    event = { kind: "fill", slot, heat };
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
    const back = cookLevel(current.since, t, current.heat, rules);
    const base = breadBase(current.front, back, rules);
    const perfect =
      judge(current.front, rules) === "PERFECT" &&
      judge(back, rules) === "PERFECT";
    if (perfect) {
      next.combo += 1;
      next.golden += 1;
    } else if (base === 0) {
      next.combo = 0;
      next.failed += 1;
    }
    const points = comboPoints(base, next.combo);
    next.score += points;
    next.made += 1;
    next.maxCombo = Math.max(next.maxCombo, next.combo);
    next.slots[slot] = emptySlot(t);
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

/** 60초가 끝났을 때. 철판에 남은 칸은 점수에 넣지 않는다. */
export function summarize(
  state: GrillState,
  rules: BungeoppangRules,
): GrillResult {
  return {
    score: state.score,
    made: state.made,
    golden: state.golden,
    failed: state.failed,
    wasted: state.wasted,
    maxCombo: state.maxCombo,
    coins: Math.floor(state.score / rules.pointsPerCoin),
  };
}

/** 서버 재계산과 같은 방식: 기록을 처음부터 적용한다. 실패하면 몇 번째 줄인지와 함께 던진다. */
export function replayGrill(
  log: readonly GrillLogEntry[],
  heats: readonly number[],
  rules: BungeoppangRules,
): GrillResult {
  if (!Array.isArray(log)) reject("BAD_ENTRY", "입력 기록이 목록이 아닙니다.");
  if (log.length > rules.maxLogEntries)
    reject("LOG_TOO_LONG", "입력 기록이 너무 깁니다.");
  let state = createGrill(heats, rules);
  log.forEach((entry, index) => {
    try {
      state = applyAction(state, entry, rules).state;
    } catch (error) {
      if (error instanceof BungeoppangRuleError)
        throw Object.assign(error, { index });
      throw error;
    }
  });
  return summarize(state, rules);
}

/** 하루 상한을 적용한 실제 지급량. 실제 지급은 서버만 정한다. */
export function grantCoins(
  coins: number,
  earnedToday: number,
  rules: BungeoppangRules,
): number {
  return Math.max(0, Math.min(coins, rules.dailyCoinCap - earnedToday));
}

/** 불 세기 목록 생성. 실제로는 서버가 만들고, 이 함수는 목업 서버와 테스트용이다. */
export function makeHeatList(
  random: () => number,
  rules: BungeoppangRules,
): number[] {
  const span = rules.heatMax - rules.heatMin + 1;
  return Array.from(
    { length: rules.heatListLength },
    () => rules.heatMin + Math.min(span - 1, Math.floor(random() * span)),
  );
}
