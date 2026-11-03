import { describe, expect, it } from "vitest";
import {
  BungeoppangRuleError,
  actionFor,
  applyAction,
  comboPoints,
  cookLevel,
  createGrill,
  grantCoins,
  judge,
  makeHeatList,
  replayGrill,
  type GrillLogEntry,
} from "../../src/features/bungeoppang/rules";
import { BUNGEOPPANG as R } from "../../src/features/bungeoppang/config";

const flat = (heat = 100) => Array<number>(R.heatListLength).fill(heat);
/** 한 칸에서 한 개: 반죽 → 팥 → 뒤집기 → 꺼내기 */
const bread = (
  slot: number,
  t0: number,
  frontMs: number,
  backMs: number,
): GrillLogEntry[] => [
  { slot, action: "POUR", t: t0 },
  { slot, action: "FILL", t: t0 + 300 },
  { slot, action: "TURN", t: t0 + 300 + frontMs },
  { slot, action: "TURN", t: t0 + 300 + frontMs + backMs },
];
const sorted = (log: GrillLogEntry[]) => [...log].sort((a, b) => a.t - b.t);

describe("붕어빵 익힘과 판정 (BE 명세 15장 공용 케이스)", () => {
  it.each([
    [0, 3_999, 100, 49, "RAW"],
    [0, 4_000, 100, 50, "GOOD"],
    [0, 5_599, 100, 69, "GOOD"],
    [0, 5_600, 100, 70, "PERFECT"],
    [0, 7_279, 100, 90, "PERFECT"],
    [0, 7_280, 100, 91, "GOOD"],
    [0, 7_999, 100, 99, "GOOD"],
    [0, 8_000, 100, 100, "BURNT"],
    [0, 5_600, 115, 80, "PERFECT"],
    [0, 5_600, 85, 59, "GOOD"],
    [0, 6_580, 85, 69, "GOOD"],
    [0, 6_590, 85, 70, "PERFECT"],
    [41_000, 45_200, 100, 70, "PERFECT"],
    [41_000, 47_000, 100, 100, "BURNT"],
    [38_000, 42_000, 100, 58, "GOOD"],
    [38_000, 42_000, 110, 64, "GOOD"],
  ] as const)(
    "%i → %i, 불 %i%% = 익힘 %i %s",
    (since, at, heat, level, judgement) => {
      expect(cookLevel(since, at, heat, R)).toBe(level);
      expect(judge(level, R)).toBe(judgement);
    },
  );
});

describe("점수와 콤보", () => {
  it("양면 황금 7연속은 10+10+12+12+12+15+15 = 86점, 17냥", () => {
    // 손님 몰림(40초) 전에 모두 꺼내도록: 6칸을 0.4초 간격으로 돌리고 7번째는 0번 칸을 다시 쓴다.
    const log = sorted([
      ...Array.from({ length: 6 }, (_, i) =>
        bread(i, i * 400, 6_000, 6_000),
      ).flat(),
      ...bread(0, 13_000, 6_000, 6_000),
    ]);
    const result = replayGrill(log, flat(), R);
    expect(result).toMatchObject({
      score: 86,
      made: 7,
      golden: 7,
      maxCombo: 7,
      coins: 17,
    });
  });
  it("콤보 배율은 정수로 내림한다", () => {
    expect(comboPoints(7, 3)).toBe(8);
    expect(comboPoints(4, 6)).toBe(6);
    expect(comboPoints(10, 2)).toBe(10);
  });
  it("탄 붕어빵과 버리기는 콤보를 끊고, 알맞음이 섞이면 유지한다", () => {
    let log = sorted([
      ...bread(0, 0, 6_000, 6_000),
      ...bread(1, 400, 6_000, 6_000),
      ...bread(2, 800, 6_000, 6_000),
      // 세 개를 꺼낸 뒤(콤보 3) 꺼내는 알맞음 + 황금 = 내림(7 × 1.2) = 8
      ...bread(3, 14_000, 4_500, 6_000),
    ]);
    let state = createGrill(flat(), R);
    for (const entry of log) state = applyAction(state, entry, R).state;
    expect(state.combo).toBe(3);
    expect(state.score).toBe(10 + 10 + 12 + 8);
    state = applyAction(state, { slot: 4, action: "POUR", t: 30_000 }, R).state;
    state = applyAction(
      state,
      { slot: 4, action: "DISCARD", t: 30_400 },
      R,
    ).state;
    expect(state).toMatchObject({ combo: 0, wasted: 1 });
    log = sorted([
      ...bread(0, 0, 6_000, 6_000),
      ...bread(1, 400, 6_000, 8_200),
    ]);
    expect(replayGrill(log, flat(), R)).toMatchObject({
      score: 10,
      failed: 1,
      maxCombo: 1,
    });
  });
  it("60초에 철판에 남은 붕어빵은 점수에 넣지 않는다", () => {
    const log = bread(0, 50_000, 6_000, 6_000).slice(0, 3);
    expect(replayGrill(log, flat(), R)).toMatchObject({ score: 0, made: 0 });
  });
});

describe("불 세기 목록", () => {
  it("팥을 넣은 순서대로 꺼내고, 버린 붕어빵의 값은 돌려놓지 않는다", () => {
    const heats = [115, 85, ...flat(100)].slice(0, R.heatListLength);
    let state = createGrill(heats, R);
    for (const entry of [
      { slot: 0, action: "POUR", t: 0 },
      { slot: 0, action: "FILL", t: 300 },
      { slot: 0, action: "DISCARD", t: 700 },
      { slot: 1, action: "POUR", t: 800 },
      { slot: 1, action: "FILL", t: 1_100 },
    ] as GrillLogEntry[])
      state = applyAction(state, entry, R).state;
    expect(state.slots[1]!.heat).toBe(85);
    expect(state.fills).toBe(2);
  });
  it("목록 생성은 85~115 정수 64개", () => {
    const heats = makeHeatList(Math.random, R);
    expect(heats).toHaveLength(64);
    expect(heats.every((h) => Number.isInteger(h) && h >= 85 && h <= 115)).toBe(
      true,
    );
    expect(makeHeatList(() => 0.999999, R)[0]).toBe(115);
    expect(makeHeatList(() => 0, R)[0]).toBe(85);
  });
});

describe("기록 검증 (BE 명세 6장)", () => {
  it("1,200줄을 넘는 기록은 재계산 전에 거부한다", () => {
    expect(() =>
      replayGrill(
        Array(1201).fill({ slot: 0, action: "POUR", t: 0 }),
        flat(),
        R,
      ),
    ).toThrowError(expect.objectContaining({ code: "LOG_TOO_LONG" }));
  });
  it("잘못된 기록 항목은 BAD_ENTRY로 거부한다", () => {
    expect(() =>
      replayGrill([null] as unknown as GrillLogEntry[], flat(), R),
    ).toThrowError(expect.objectContaining({ code: "BAD_ENTRY" }));
  });
  const code = (log: GrillLogEntry[]) => {
    try {
      replayGrill(log, flat(), R);
      return "OK";
    } catch (error) {
      return error instanceof BungeoppangRuleError
        ? `${error.code}@${(error as BungeoppangRuleError & { index: number }).index}`
        : "THROWN";
    }
  };
  it.each([
    [
      "빈 칸에 FILL",
      [{ slot: 0, action: "FILL", t: 0 }],
      "ACTION_STATE_MISMATCH@0",
    ],
    [
      "반죽 칸에 TURN",
      [
        { slot: 0, action: "POUR", t: 0 },
        { slot: 0, action: "TURN", t: 400 },
      ],
      "ACTION_STATE_MISMATCH@1",
    ],
    [
      "같은 칸 250ms",
      [
        { slot: 0, action: "POUR", t: 1_000 },
        { slot: 0, action: "FILL", t: 1_250 },
      ],
      "SAME_SLOT_TOO_FAST@1",
    ],
    [
      "다른 칸 30ms",
      [
        { slot: 0, action: "POUR", t: 1_000 },
        { slot: 1, action: "POUR", t: 1_030 },
      ],
      "TOO_FAST@1",
    ],
    [
      "시간 역행",
      [
        { slot: 0, action: "POUR", t: 2_000 },
        { slot: 1, action: "POUR", t: 1_900 },
      ],
      "TIME_REVERSED@1",
    ],
    ["시간 밖", [{ slot: 0, action: "POUR", t: 60_001 }], "BAD_ENTRY@0"],
    ["없는 칸", [{ slot: 6, action: "POUR", t: 0 }], "BAD_ENTRY@0"],
  ] as [string, GrillLogEntry[], string][])("%s", (_name, log, expected) => {
    expect(code(log)).toBe(expected);
  });
  it("불 세기 목록보다 많은 팥은 거부한다", () => {
    let log: GrillLogEntry[] = [];
    let t = 0;
    for (let i = 0; i < 65; i++) {
      log.push(
        { slot: 0, action: "POUR", t },
        { slot: 0, action: "FILL", t: t + 300 },
        { slot: 0, action: "DISCARD", t: t + 600 },
      );
      t += 900;
    }
    log = log.filter((entry) => entry.t <= R.durationMs);
    expect(() => replayGrill(log, flat().slice(0, 3), R)).toThrow(/불 세기/);
  });
});

describe("재료와 엽전", () => {
  it("칸 상태와 손에 든 재료로 동작이 정해진다", () => {
    expect(actionFor("empty", "batter")).toBe("POUR");
    expect(actionFor("empty", "bean")).toBe("NEED_BATTER");
    expect(actionFor("batter", "bean")).toBe("FILL");
    expect(actionFor("batter", "batter")).toBe("NEED_BEAN");
    expect(actionFor("front", "batter")).toBe("TURN");
    expect(actionFor("back", "bean")).toBe("TURN");
  });
  it.each([
    [0, 11, 11],
    [495, 11, 5],
    [500, 11, 0],
    [50, 0, 0],
  ])("오늘 %i냥, 계산 %i냥 → 지급 %i냥", (earned, coins, granted) => {
    expect(grantCoins(coins, earned, R)).toBe(granted);
  });
});
