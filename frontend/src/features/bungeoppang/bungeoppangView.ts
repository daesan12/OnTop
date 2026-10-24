import { BUNGEOPPANG } from "./config";
import { MINI_PROPS } from "../../config";

/**
 * 붕어빵 카트 위의 개인 철판 배치. 카트 GLB(scripts/repair-cart-prop.py)의 여섯 홈 좌표를
 * 3.9배 확대·glTF 축 변환한 값이다. 철판은 기존 홈 위에 덮는 개인 표시용 판이며 내 화면에만 보인다.
 */
const cart = MINI_PROPS.find((p) => p.id === "fish-bread")!;
const columns = [-0.4875, -0.039, 0.4095];
/** 뒷줄(Q W E), 앞줄(A S D). 플레이어는 +z 쪽에서 -z를 바라본다. */
const rows = [0.0585, 0.585];
export const BUNG_GRILL = {
  center: [cart.x - 0.039, 1.875, cart.z + 0.3218] as const,
  plate: { width: 1.42, depth: 0.98, thickness: 0.085 },
  /** 철판 윗면 높이. 붕어빵은 이 위에 놓인다. */
  top: 1.875,
  slots: rows.flatMap((z) =>
    columns.map((x) => [cart.x + x, cart.z + z] as const),
  ),
  /** 붕어빵 길이(m). 홈 원본 0.098 × 3.9. */
  breadLength: 0.382,
};

/** CameraRig가 매 프레임 읽는 조리대 시점. React 상태로 바꾸지 않는다. */
export const bungeoppangView = {
  active: false,
  /** 복귀 전환이 끝나는 시각(performance.now). 1인칭 복귀도 부드럽게 하기 위해 쓴다. */
  returningUntil: 0,
  // 약 45° 내려다보기. 카트 앞 간판은 이 시점을 가려서 굽는 동안 내 화면에서만 숨긴다.
  position: [cart.x - 0.039, 3.07, cart.z + 1.58] as [number, number, number],
  target: [cart.x - 0.039, 1.79, cart.z + 0.31] as [number, number, number],
  fov: 45,
  /** 조리대 시점을 가리는 카트 GLB 재질(앞 간판). 굽는 동안 내 화면에서만 숨긴다. */
  hiddenCartMaterials: ["Cream fascia", "Readable Korean sign atlas"],
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
