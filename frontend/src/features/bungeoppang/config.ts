/**
 * 붕어빵 뒤집기 규칙 v2 (2026-10-22 기획 확정값).
 * 기획: 한 면 8초(손님 몰림 6초), 탐 100, 재료 들기 조작, 15점당 1냥.
 * 실제 엽전 지급·하루 상한·불 세기 목록 발급은 서버 권한이다. 이 값은 표시와 규칙 계산용이다.
 */
export const BUNGEOPPANG = {
  rulesVersion: "v2",
  slots: 6,
  /** Q W E / A S D 순서. 0~2 뒷줄, 3~5 앞줄. */
  slotKeys: ["q", "w", "e", "a", "s", "d"] as const,
  durationMs: 60_000,
  sideMs: 8_000,
  rushSideMs: 6_000,
  rushFromMs: 40_000,
  rushWarnFromMs: 37_000,
  heatMin: 85,
  heatMax: 115,
  heatListLength: 64,
  maxLogEntries: 1_200,
  okFrom: 50,
  goldenFrom: 70,
  goldenTo: 90,
  burntFrom: 100,
  okPoint: 2,
  goldenPoint: 5,
  pointsPerCoin: 15,
  dailyCoinCap: 100,
  minGapMs: 50,
  sameSlotGapMs: 300,
  countdownMs: 3_500,
  endingMs: 1_100,
  cameraTransitionMs: 800,
  cameraReturnMs: 240,
} as const;

/** FE v4 defaults. These preview limits are not a production server contract. */
export const BUNGEOPPANG_V4 = {
  ...BUNGEOPPANG,
  rulesVersion: 'v4',
  trayCapacity: 4,
  maxOrderItems: 4,
  orderListLength: 64,
  heatListLength: 400,
  specialOrderChance: 0.2,
  specialBonusPercent: 50,
  firstOrder: { bean: 2, custard: 0, pizza: 0, chocolate: 0 },
} as const;

// Deliberate development mode only; never enable a mock after an API error.
export const bungeoppangV4Preview = import.meta.env?.DEV === true && import.meta.env.MODE === 'bungeoppang-preview';

export const BUNGEOPPANG_V5 = {
  ...BUNGEOPPANG_V4,
  rulesVersion: 'v5',
  heatAssignment: 'FILL',
  durationMs: 120_000,
  rushFromMs: 90_000,
  rushWarnFromMs: 87_000,
  trayCapacity: 10,
  maxActiveOrders: 3,
  heatListLength: 2048,
  maxLogEntries: 3600,
} as const;
/** Existing server-issued v5 rounds retain their original three-minute snapshot. */
export const BUNGEOPPANG_V5_LEGACY = {
  ...BUNGEOPPANG_V5,
  durationMs: 180_000,
  rushFromMs: 150_000,
  rushWarnFromMs: 147_000,
} as const;
/** Deliberate opt-in only. A missing v5 backend must never turn into a simulated reward. */
export const bungeoppangV5Preview = import.meta.env?.DEV === true && import.meta.env.MODE === 'bungeoppang-v5-preview';
/** Enable only after the BE team accepts/deploys the v5 draft contract. Default remains v4. */
export const bungeoppangV5Enabled = bungeoppangV5Preview || import.meta.env.VITE_BUNGEOPPANG_RULES_VERSION === 'v5';
