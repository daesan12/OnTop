import { BUNGEOPPANG } from "./config";
import { MINI_PROPS } from "../../config";
import { FISH_CART_GRILL } from '../../config/fishCart';

/** 현재 코드 기반 카트의 여섯 홈과 일치하는 개인 조리 표시. */
const cart = MINI_PROPS.find((p) => p.id === "fish-bread")!;
const layout = FISH_CART_GRILL;
const [cx, , cz] = layout.center;
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
  position: [cart.x + cx, layout.surfaceY + 1.2, cart.z + cz + 1.12] as [number, number, number],
  target: [cart.x + cx, layout.surfaceY, cart.z + cz] as [number, number, number],
  fov: 40,
  /** 내가 굽는 동안 가린다: 가게 앞 다른 캐릭터(반경 m). */
  hideOthersRadius: 2.6,
  standX: cart.x,
  standZ: cart.z + cart.depth / 2 + 1,
};

/** Monotonic wall time: hidden tabs and help do not pause the server's 60-second round. */
export const bungeoppangClock = {
  t: 0,
  frameAt: 0,
  countdown: 0,
  ending: 0,
  playAt: 0,
};
export function gameNow() {
  return Math.min(
    BUNGEOPPANG.durationMs,
    Math.max(0, Math.floor(performance.now() - bungeoppangClock.playAt)),
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
