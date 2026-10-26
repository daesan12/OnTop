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
