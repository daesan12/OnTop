import { BUNGEOPPANG, bungeoppangV5Enabled } from "./config";
import { MINI_PROPS } from "../../park/mapConfig";
import { FISH_CART_GRILL } from '../../config/fishCart';

/** 현재 코드 기반 카트의 여섯 홈과 일치하는 개인 조리 표시. */
const cart = MINI_PROPS.find((p) => p.id === "fish-bread")!;
const layout = FISH_CART_GRILL;
const [cx, , cz] = layout.center;
const shopYaw = 'yaw' in cart ? cart.yaw : 0;
const standDistance = cart.depth / 2 + 1;
/** 뒷줄(Q W E), 앞줄(A S D). 플레이어는 +z 쪽에서 -z를 바라본다. */
export const BUNG_GRILL = {
  center: [cart.x + cx, layout.surfaceY, cart.z + cz] as const,
  /** 철판 윗면 높이. 붕어빵은 이 위에 놓인다. */
  top: layout.surfaceY,
  slots: layout.rows.flatMap((z) =>
    layout.columns.map((x) => [cart.x + cx + x, cart.z + cz + z] as const),
  ),
  breadLength: layout.breadLength,
  mouldScale: layout.mouldScale,
};

/** CameraRig가 매 프레임 읽는 조리대 시점. React 상태로 바꾸지 않는다. */
export const bungeoppangView = {
  active: false,
  /** 복귀 전환이 끝나는 시각(performance.now). 1인칭 복귀도 부드럽게 하기 위해 쓴다. */
  returningUntil: 0,
  // 약 45° 내려다보기. CodeFishBreadCart가 조리 중·복귀 전환 동안 차양과 상단 간판을 숨긴다.
  position: (bungeoppangV5Enabled ? [cart.x + cx, layout.surfaceY + 1.10, cart.z + cz + 1.52]
    : [cart.x + cx, layout.surfaceY + 1.2, cart.z + cz + 1.12]) as [number, number, number],
  target: (bungeoppangV5Enabled ? [cart.x + cx, layout.surfaceY + .145, cart.z + cz - .02]
    : [cart.x + cx, layout.surfaceY, cart.z + cz]) as [number, number, number],
  fov: bungeoppangV5Enabled ? 36 : 40,
  standX: cart.x + Math.sin(shopYaw) * standDistance,
  standZ: cart.z + Math.cos(shopYaw) * standDistance,
};

/** Reveal only after the camera has cleared the local avatar; controls are already live. */
export function bungeoppangReturnOpacity(now: number, reducedMotion = false) {
  if (bungeoppangView.active || now < bungeoppangView.returningUntil) return 0;
  if (!bungeoppangView.returningUntil || reducedMotion) return 1;
  const t = Math.min(1, Math.max(0, (now - bungeoppangView.returningUntil) / 320));
  return t * t * (3 - 2 * t);
}

/** Hidden tabs keep wall time; an acknowledged manual pause freezes the private cooking clock. */
export const bungeoppangClock = {
  t: 0,
  durationMs: Number(BUNGEOPPANG.durationMs),
  frameAt: 0,
  countdown: 0,
  ending: 0,
  playAt: 0,
  countdownAt: 0,
  preparing: false,
  pausedAt: null as number | null,
};
export function gameNow() {
  return Math.min(
    bungeoppangClock.durationMs,
    Math.max(0, Math.floor((bungeoppangClock.pausedAt??performance.now()) - bungeoppangClock.playAt)),
  );
}

/** 칸마다 연출 시작 시각. 3D와 DOM이 같이 읽는다. */
export const slotFx = Array.from({ length: BUNGEOPPANG.slots }, () => ({
  shakeAt: -1e9,
  flipAt: -1e9,
  takeAt: -1e9,
  pourAt: -1e9,
  fillAt: -1e9,
  hover: false,
}));
/** 칸 위에 붙는 DOM. 3D 루프가 화면 좌표로 옮긴다. */
export const slotOverlayEls: (HTMLElement | null)[] = Array(
  BUNGEOPPANG.slots,
).fill(null);
/** 마지막으로 계산한 칸의 화면 좌표(px). 판정 팝업 위치에 쓴다. */
export const slotScreen = Array.from({ length: BUNGEOPPANG.slots }, () => ({
  x: 0,
  y: 0,
  width: 0,
}));
