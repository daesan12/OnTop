import { create } from "zustand";
import { useManual, openManual, closeManual, resetManual } from "../manual/manualState";
import { BUNGEOPPANG } from "./config";
import { BUNGEOPPANG_V4 } from './config';
import * as v4 from './rulesV4';
import type { BungFeedback, FeedbackPoint } from './presentation';
import { slotScreen } from './bungeoppangView';
import {
  actionFor,
  applyAction,
  cookLevel,
  createGrill,
  type BreadAction,
  type GrillEvent,
  type GrillState,
  type Judgement,
} from "./rules";
type BreadTool = v4.BreadTool;
type AnyGrill = GrillState | v4.GrillState;
export const isV4Grill = (grill: AnyGrill | null): grill is v4.GrillState => !!grill && 'rulesVersion' in grill;
import { inputState } from "../../world/inputOwnership";
import { useSession } from '../../network/worldClient';
import { rememberRoamingView } from '../../world/cameraReturn';
import { canOpenBungeoppang } from './access';
import {
  bungeoppangClock as clock,
  bungeoppangView as view,
  gameNow,
  slotFx,
} from "./bungeoppangView";
import {
  bungeoppangService as service,
  BungeoppangServiceError,
  type BungeoppangStatus,
  type BungeoppangSubmitResult,
  type BungeoppangSubmit,
} from "./service";

export type BungPhase =
  | "idle"
  | "entering"
  | "start"
  | "countdown"
  | "play"
  | "ending"
  | "result"
  | "leaving";
export type TipKey = "START" | "POUR" | "GOLD" | "BURNT" | "RUSH";
export const TIP_TEXT: Record<TipKey, string> = {
  START: "클릭이나 Q W E A S D로 빈 칸에 반죽을 부어요",
  POUR: "주문에 맞는 소를 고르고 반죽 칸에 넣어요",
  GOLD: "지금! 노릇할 때 뒤집어요",
  BURNT: "탄 건 0점! 우클릭으로 버릴 수 있어요",
  RUSH: "손님이 몰려서 불이 세졌어요!",
};
export type PopupTone = Judgement | "PLAIN" | "SIZZLE";
export interface BungPopup {
  id: number;
  slot: number | null;
  text: string;
  tone: PopupTone;
}
interface BungState {
  phase: BungPhase;
  tool: BreadTool;
  toolRevision: number;
  feedback: BungFeedback[];
  grill: AnyGrill | null;
  rules: Readonly<v4.BungeoppangRules>;
  orderPending: boolean;
  orderError: string | null;
  gameId: string;
  status: BungeoppangStatus | null;
  statusError: string | null;
  starting: boolean;
  startError: string | null;
  confirmExit: boolean;
  helpOpen: boolean;
  abandonPending: boolean;
  abandonError: string | null;
  walletError: string | null;
  /** 마우스를 올린 칸. 동작 이름 표시용(포인터 이벤트 때만 바뀜). */
  hover: number | null;
  firstGame: boolean;
  seenTips: string[];
  newTips: TipKey[];
  tip: { key: TipKey; slot: number | null; id: number } | null;
  popups: BungPopup[];
  result: BungeoppangSubmitResult | null;
  submitting: boolean;
  submitError: { message: string; retryable: boolean } | null;
}
const initial = (): Omit<BungState, "phase" | "status" | "seenTips"> => ({
  tool: "batter",
  toolRevision: 0,
  feedback: [],
  grill: null,
  rules: BUNGEOPPANG_V4,
  orderPending: false,
  orderError: null,
  gameId: "",
  statusError: null,
  starting: false,
  startError: null,
  confirmExit: false,
  helpOpen: false,
  abandonPending: false,
  abandonError: null,
  walletError: null,
  hover: null,
  firstGame: false,
  newTips: [],
  tip: null,
  popups: [],
  result: null,
  submitting: false,
  submitError: null,
});
export const useBungeoppang = create<BungState>(() => ({
  phase: "idle",
  status: null,
  seenTips: [],
  ...initial(),
}));
const get = useBungeoppang.getState,
  set = useBungeoppang.setState;
const R = BUNGEOPPANG;

export const bungeoppangActive = () => get().phase !== "idle";
const clearHeldInput = () =>
  window.dispatchEvent(new Event("ontop-clear-input"));

let popupId = 0;
function popup(slot: number | null, text: string, tone: PopupTone) {
  const id = ++popupId;
  set((s) => ({ popups: [...s.popups.slice(-11), { id, slot, text, tone }] }));
  setTimeout(
    () => set((s) => ({ popups: s.popups.filter((p) => p.id !== id) })),
    900,
  );
}
let tipTimer = 0;
// Async responses belong to one visit and one game, including after reconnect.
let visit = 0;
let walletRequest = 0;
let startKey = '';
let submission: BungeoppangSubmit | null = null;
let loopTimer: ReturnType<typeof setInterval> | undefined;
let transitionTimer: ReturnType<typeof setTimeout>;
export function setBungeoppangHelp(open: boolean) {
  if (open && (get().phase === "idle" || get().phase === "leaving")) return;
  if (open) openManual("fish-bread");
  else if (useManual.getState().page === "fish-bread") closeManual();
}
async function refreshWallet(currentVisit: number) {
  if (service.mock) return;
  const owner = useSession.getState().sessionId;
  const request = ++walletRequest;
  try {
    const balance = await service.balance();
    if (visit !== currentVisit || useSession.getState().sessionId !== owner || request !== walletRequest) return;
    const account = useSession.getState().account;
    if (account) useSession.setState({ account: { ...account, balance } });
    set({ walletError: null });
  } catch (error) {
    if (visit === currentVisit && request === walletRequest) set({ walletError:
      error instanceof BungeoppangServiceError && error.code === 'WALLET_NOT_READY' ? error.message
        : '지갑 잔액을 새로 확인하지 못했어요. 잔액을 다시 확인해 주세요. 지급 여부는 서버 확정 결과를 확인해 주세요.' });
  }
}
export async function refreshBungeoppangWallet() {
  if (get().phase === 'idle' || get().phase === 'leaving') return;
  await refreshWallet(visit);
}
export async function refreshBungeoppangStatus() {
  const currentVisit = visit;
  set({ statusError: null });
  void refreshWallet(currentVisit);
  try {
    const status = await service.getStatus();
    if (visit === currentVisit) set({ status, seenTips: status.seenTips, firstGame: status.isFirstGame });
  } catch (error) {
    if (visit === currentVisit) set({ statusError: error instanceof Error ? error.message : '오늘 번 엽전을 불러오지 못했어요.' });
  }
}
function tip(key: TipKey, slot: number | null = null) {
  const s = get();
  if (s.seenTips.includes(key) || s.newTips.includes(key)) return;
  if (key === "START" && !s.firstGame) return;
  const id = ++popupId;
  set({ tip: { key, slot, id }, newTips: [...s.newTips, key] });
  clearTimeout(tipTimer);
  tipTimer = window.setTimeout(() => {
    if (get().tip?.id === id) set({ tip: null });
  }, 2600);
}

/** 굽는 면마다 "치익"과 말풍선을 한 번만 띄우기 위한 표시. */
const crossed = Array.from({ length: R.slots }, () => ({
  gold: false,
  burnt: false,
}));

// ---------- 진입과 나가기 ----------
export function openBungeoppang() {
  if (get().phase !== "idle" || !canOpenBungeoppang()) return;
  const session = useSession.getState();
  rememberRoamingView(session.sessionId, session.roomId);
  ++visit;
  set({ phase: "entering", ...initial(), status: null, seenTips: [] });
  inputState.minigameOpen = true;
  clearHeldInput();
  view.active = true;
  view.returningUntil = 0;
  startKey = '';
  submission = null;
  orderSubmission = null;
  if (document.pointerLockElement) void document.exitPointerLock();
  (document.activeElement as HTMLElement | null)?.blur?.();
  void refreshBungeoppangStatus();
  transitionTimer = setTimeout(() => {
    if (get().phase === "entering") set({ phase: "start" });
  }, R.cameraTransitionMs);
}
export function leaveBungeoppang() {
  const phase = get().phase;
  if (phase === "idle" || phase === "leaving") return;
  ++visit;
  clearTimeout(transitionTimer);
  clearTimeout(tipTimer);
  cancelAnimationFrame(raf);
  clearInterval(loopTimer);
  if (get().helpOpen) resetManual();
  view.active = false;
  view.returningUntil = performance.now() + R.cameraReturnMs;
  // Camera easing is visual only. Restore the HUD and controls in this turn,
  // after the server has acknowledged abandon when a round is active.
  inputState.minigameOpen = false;
  clearHeldInput();
  set({ phase: "idle", ...initial() });
}
/** 연결이 끊기는 등 화면을 바로 정리해야 할 때. */
export function resetBungeoppang() {
  if (get().phase === 'idle' && !view.active && !view.returningUntil) return;
  ++visit;
  clearTimeout(transitionTimer);
  clearTimeout(tipTimer);
  cancelAnimationFrame(raf);
  clearInterval(loopTimer);
  if (get().helpOpen) resetManual();
  startKey = '';
  submission = null;
  orderSubmission = null;
  view.active = false;
  view.returningUntil = 0;
  set({ phase: "idle", ...initial(), status: null, seenTips: [] });
  inputState.minigameOpen = false;
  clearHeldInput();
}

// ---------- 판 시작 ----------
export async function startBungeoppang() {
  const s = get();
  if (s.starting || !s.status || s.submitting || s.abandonPending || (s.phase !== "start" && s.phase !== "result")
    || (s.phase === 'result' && !s.result && s.submitError?.retryable !== false)) return;
  const currentVisit = visit;
  set({ starting: true, startError: null });
  try {
    startKey ||= crypto.randomUUID();
    const game = await service.startGame(startKey);
    if (visit !== currentVisit) {
      void service.abandon(game.gameId).catch(() => {});
      return;
    }
    if (game.rulesVersion !== R.rulesVersion && !(game.rulesVersion === 'v4' && game.v4 && service.nextOrder))
      throw new BungeoppangServiceError(
        "RULES_VERSION_MISMATCH",
        "게임이 업데이트됐어요. 새로고침해 주세요.",
      );
    if (get().phase !== "start" && get().phase !== "result") return;
    startKey = '';
    submission = null;
    orderSubmission = null;
    for (const c of crossed) Object.assign(c, { gold: false, burnt: false });
    for (const fx of slotFx)
      Object.assign(fx, {
        shakeAt: -1e9,
        flipAt: -1e9,
        takeAt: -1e9,
        pourAt: -1e9,
        fillAt: -1e9,
      });
    const playDelay = game.v4?.timing
      ? Math.max(0, Date.parse(game.v4.timing.playStartsAt) - Date.now())
      : R.countdownMs;
    Object.assign(clock, {
      t: 0,
      frameAt: performance.now(),
      countdown: playDelay,
      ending: 0,
      playAt: performance.now() + playDelay,
    });
    set({
      phase: "countdown",
      starting: false,
      gameId: game.gameId,
      grill: game.v4 ? v4.createGrill(game.heats, game.v4.order, game.v4.rules) : createGrill(game.heats, R),
      rules: Object.freeze({ ...(game.v4?.rules ?? BUNGEOPPANG_V4) }),
      orderPending: false,
      orderError: null,
      tool: "batter",
      toolRevision: 0,
      feedback: [],
      firstGame: game.isFirstGame,
      confirmExit: false,
      newTips: [],
      popups: [],
      tip: null,
      result: null,
      submitError: null,
    });
    (document.activeElement as HTMLElement | null)?.blur?.();
    tip("START");
    startLoop();
  } catch (error) {
    if (visit !== currentVisit) return;
    set({
      starting: false,
      startError: error instanceof Error ? error.message : "연결이 불안정해요. 같은 요청으로 다시 시도해 주세요.",
    });
    if (error instanceof BungeoppangServiceError && !error.retryable) startKey = '';
  }
}

// ---------- 플레이 입력 ----------
const canAct = () => {
  advanceBungeoppangTime();
  const s = get();
  return (
    s.phase === "play" &&
    !s.confirmExit &&
    !s.abandonPending && !document.hidden &&
    !inputState.manualOpen &&
    !inputState.chatOpen &&
    !!s.grill
  );
};
export function setBungeoppangTool(tool: BreadTool) {
  if (!v4.BREAD_TOOLS.includes(tool) || !canAct() || get().tool === tool || (!isV4Grill(get().grill) && tool !== 'batter' && tool !== 'bean')) return;
  set(s => ({ tool, toolRevision: s.toolRevision + 1 }));
}
export function cycleBungeoppangTool(direction: number) {
  const tools = isV4Grill(get().grill) ? v4.BREAD_TOOLS : ['batter', 'bean'] as const;
  const index = tools.indexOf(get().tool as 'batter' | 'bean');
  setBungeoppangTool(tools[Math.max(0, Math.min(tools.length - 1, index + Math.sign(direction)))]!);
}
function act(slot: number, action: v4.BreadAction) {
  const grill = get().grill!;
  if (!Number.isInteger(slot)) return;
  if (grill.log.length >= R.maxLogEntries) { popup(null, '입력 기록 한도에 도달했어요. 이번 판은 추가 조작할 수 없어요.', 'PLAIN'); return; }
  const t = gameNow();
  const current = action === 'DELIVER' || action === 'TRAY_DISCARD' ? null : grill.slots[slot];
  // 서버가 거부할 입력은 기록하지 않는다(같은 칸 0.3초, 연타 0.05초).
  if (current && current.lastAt !== null && t - current.lastAt < R.sameSlotGapMs) return;
  if (
    grill.lastAt !== null &&
    (t < grill.lastAt || t - grill.lastAt < R.minGapMs)
  )
    return;
  let result;
  try {
    if (isV4Grill(grill)) {
      const entry: v4.GrillLogEntry = { slot, action, t };
      if (action === 'FILL' && get().tool !== 'batter') entry.filling = get().tool as v4.BreadFilling;
      if (action === 'DELIVER') entry.order = grill.orderIndex;
      result = v4.applyAction(grill, entry, get().rules);
    } else result = applyAction(grill, { slot, action: action as BreadAction, t }, R);
  } catch (error) {
    if (error instanceof Error) popup(current ? slot : null, error.message, 'PLAIN');
    return;
  }
  set({ grill: result.state });
  onEvent(result.event, grill);
  if (result.event.kind === 'deliver') void requestBungeoppangOrder();
}
export function pressBungeoppangSlot(slot: number) {
  if (!Number.isInteger(slot) || slot < 0 || slot >= R.slots || !canAct()) return;
  const s = get();
  const current = s.grill!.slots[slot]!;
  const action = isV4Grill(s.grill) ? v4.actionFor(current.phase, s.tool) : actionFor(current.phase, s.tool as 'batter' | 'bean');
  if (action === "NEED_BATTER" || action === "NEED_BEAN" || action === 'NEED_FILLING') {
    slotFx[slot]!.shakeAt = performance.now();
    popup(
      slot,
      action === "NEED_BATTER"
        ? "반죽부터 부어요 (Space / 휠 위)"
        : isV4Grill(s.grill) ? '소를 골라요 (1 팥 · 2 슈크림 · 3 피자 · 4 초코)' : "팥으로 바꿔요 (1 / 휠 아래)",
      "PLAIN",
    );
    return;
  }
  act(slot, action);
}
export function discardBungeoppangSlot(slot: number) {
  if (!Number.isInteger(slot) || slot < 0 || slot >= R.slots || !canAct() || get().grill!.slots[slot]!.phase === "empty") return;
  act(slot, "DISCARD");
}
export function deliverBungeoppangOrder() {
  if (canAct() && isV4Grill(get().grill) && !get().orderPending && !get().orderError) act(-1, 'DELIVER');
}
export function discardBungeoppangTray(index: number) {
  if (canAct() && isV4Grill(get().grill)) act(index, 'TRAY_DISCARD');
}
let orderSubmission: BungeoppangSubmit | null = null;
export async function requestBungeoppangOrder() {
  const s = get();
  if (!isV4Grill(s.grill) || s.grill.order || s.orderPending || !service.nextOrder || s.phase !== 'play') return;
  const currentVisit = visit, index = s.grill.orderIndex;
  orderSubmission = s.orderError && orderSubmission?.gameId === s.gameId ? orderSubmission : {
    gameId: s.gameId, log: s.grill.log.map(e => ({ ...e })), clientScore: s.grill.score, seenTips: [...s.newTips],
    deliveryKey: crypto.randomUUID(),
  };
  set({ orderPending: true, orderError: null });
  try {
    const reply = await service.nextOrder(orderSubmission);
    const current = get();
    if (visit !== currentVisit || current.gameId !== s.gameId || current.phase !== 'play' || !isV4Grill(current.grill) || current.grill.orderIndex !== index) return;
    set({ grill: v4.supplyOrder(current.grill, reply.index, reply.order, current.rules), orderPending: false });
    orderSubmission = null;
  } catch (error) {
    if (visit !== currentVisit || get().gameId !== s.gameId || get().phase !== 'play') return;
    const explicit = error instanceof BungeoppangServiceError && !error.retryable
      && ['DELIVERY_REJECTED', 'PREFIX_MISMATCH', 'STALE_ORDER', 'ORDER_ALREADY_DELIVERED', 'TIME_AHEAD']
        .includes(error.code);
    if (!explicit || !service.recoverV4) {
      set({ orderPending: false, orderError: error instanceof Error ? error.message : '다음 주문을 받지 못했어요.' });
      return;
    }
    try {
      const latest = get();
      const suffix = isV4Grill(latest.grill) && orderSubmission
        ? latest.grill.log.slice(orderSubmission.log.length).filter(entry => entry.action !== 'DELIVER')
        : [];
      const recovery = await service.recoverV4(s.gameId);
      if (visit !== currentVisit || get().gameId !== s.gameId || get().phase !== 'play') return;
      let recovered = recovery.grill;
      for (const entry of suffix) {
        try { recovered = v4.applyAction(recovered, entry, get().rules).state; }
        catch { /* Keep only still-legal local intent after the authoritative checkpoint. */ }
      }
      orderSubmission = null;
      set({ grill: recovered, orderPending: false, orderError: null });
      popup(null, '서버 진행 상태로 복구했어요. 현재 주문을 다시 확인해 주세요.', 'PLAIN');
    } catch (recoveryError) {
      set({ orderPending: false, orderError: recoveryError instanceof Error
        ? recoveryError.message : '진행 상태를 복구하지 못했어요. 다시 시도해 주세요.' });
    }
  }
}
function elementPoint(selector: string, fallback: FeedbackPoint): FeedbackPoint {
  const element = typeof document.querySelector === 'function' ? document.querySelector(selector) : null;
  const rect = element?.getBoundingClientRect();
  return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : { ...fallback };
}
function feedback(value: Omit<BungFeedback, 'id'>) {
  const id = ++popupId, currentVisit = visit;
  set(s => ({ feedback: [...s.feedback.slice(-7), { ...value, id }] }));
  setTimeout(() => {
    if (visit === currentVisit) set(s => ({ feedback: s.feedback.filter(item => item.id !== id) }));
  }, 1400);
}
function onEvent(event: GrillEvent | v4.GrillEvent, before: AnyGrill) {
  const v4Grill = isV4Grill(before) ? before : null;
  if (event.kind === 'deliver') {
    if (v4Grill) {
      const after = get().grill;
      const remaining = isV4Grill(after) ? new Set(after.tray.map(b => b.id)) : new Set<number>();
      v4Grill.tray.filter(b => !remaining.has(b.id)).forEach((bread, i) => feedback({
        kind: 'deliver', filling: bread.filling, points: event.points, guestIndex: v4Grill.orderIndex,
        from: elementPoint(`[data-tray-bread-id="${bread.id}"]`, { x: window.innerWidth - 130, y: 250 + i * 50 }),
        message: `${event.count}개 전달! +${event.points}점${event.bonus ? ` · 특수 +${event.bonus}` : ''}`,
      }));
    }
    popup(null, `${event.count}개 전달! +${event.points}점 (특수 +${event.bonus})`, 'PERFECT'); return;
  }
  if (event.kind === 'trayDiscard') {
    const bread = v4Grill?.tray[event.slot];
    if (bread) feedback({ kind: 'discard', filling: bread.filling, points: 0,
      from: elementPoint(`[data-tray-bread-id="${bread.id}"]`, { x: window.innerWidth - 130, y: 260 }),
      message: `${v4.BREAD_NAMES[bread.filling]} 폐기 · 점수 없음` });
    popup(null, '쟁반에서 버렸어요', 'PLAIN'); return;
  }
  const fx = slotFx[event.slot]!,
    now = performance.now();
  if (event.kind === "pour") {
    fx.pourAt = now;
    tip("POUR", event.slot);
  } else if (event.kind === "fill") {
    fx.fillAt = now;
    Object.assign(crossed[event.slot]!, { gold: false, burnt: false });
  } else if (event.kind === "flip") {
    fx.flipAt = now;
    Object.assign(crossed[event.slot]!, { gold: false, burnt: false });
    popup(event.slot, event.judgement, event.judgement);
  } else if (event.kind === "takeOut") {
    fx.takeAt = v4Grill ? -1e9 : now;
    if (v4Grill) {
      const filling = v4Grill.slots[event.slot]!.filling ?? 'batter';
      const after = get().grill;
      feedback({ kind: event.base ? 'store' : 'discard', filling, from: { ...slotScreen[event.slot]! },
        breadId: event.base && isV4Grill(after) ? after.tray.at(-1)?.id : undefined,
        points: event.points, burnt: event.front >= R.burntFrom || event.back >= R.burntFrom,
        message: event.base ? `${v4.BREAD_NAMES[filling]} ${event.points}점 · 쟁반에 보관했어요`
          : `${v4.BREAD_NAMES[filling]} ${event.front >= R.burntFrom || event.back >= R.burntFrom ? '탔어요' : '설익었어요'} · 폐기했어요` });
    }
    popup(
      event.slot,
      `${event.judgement} ${event.base ? isV4Grill(get().grill) ? '쟁반에 보관' : `+${event.points}` : "0점"}`,
      event.judgement,
    );
  } else {
    fx.takeAt = v4Grill ? -1e9 : now;
    if (v4Grill) {
      const filling = v4Grill.slots[event.slot]!.filling ?? 'batter';
      feedback({ kind: 'discard', filling, from: { ...slotScreen[event.slot]! }, points: 0,
        message: `${v4.BREAD_NAMES[filling]} 폐기 · 콤보 초기화` });
    }
    popup(event.slot, "버림", "PLAIN");
  }
}

// ---------- 나가기 확인 ----------
export function escapeBungeoppang() {
  const s = get();
  if (s.abandonPending) return;
  if (s.helpOpen) { setBungeoppangHelp(false); return; }
  if (s.phase === 'result' && !s.result && s.submitError?.retryable !== false) {
    set({ confirmExit: !s.confirmExit }); return;
  }
  if (s.phase === "start" || s.phase === "result") leaveBungeoppang();
  else if (s.phase === "countdown" || s.phase === "play")
    set({ confirmExit: !s.confirmExit });
}
export function continueBungeoppang() {
  set({ confirmExit: false });
}
export async function quitBungeoppang() {
  const { gameId, phase, abandonPending } = get();
  if (abandonPending) return;
  const currentVisit = visit;
  if (!gameId || !['countdown', 'play'].includes(phase)) { leaveBungeoppang(); return; }
  set({ abandonPending: true, abandonError: null });
  try {
    await service.abandon(gameId);
    if (visit === currentVisit) leaveBungeoppang();
  } catch (error) {
    if (visit === currentVisit) set({ abandonError: error instanceof Error ? error.message : '포기 요청을 확인하지 못했어요. 다시 시도해 주세요.' });
  } finally {
    if (visit === currentVisit) {
      set({ abandonPending: false });
      if (get().phase === 'ending' || get().phase === 'result') void submitBungeoppang();
    }
  }
}

// ---------- 결과 제출 ----------
export async function submitBungeoppang() {
  const s = get();
  if (!s.grill || s.submitting || s.abandonPending || s.result || !['ending', 'result'].includes(s.phase)) return;
  const currentVisit = visit;
  set({ submitting: true, submitError: null });
  try {
    submission ??= {
      gameId: s.gameId,
      log: s.grill.log.map(entry => ({ ...entry })),
      seenTips: [...s.newTips],
      clientScore: s.grill.score,
      completeKey: crypto.randomUUID(),
      ...(orderSubmission?.gameId === s.gameId && orderSubmission.deliveryKey
        ? { deliveryKey: orderSubmission.deliveryKey } : {}),
    };
    const result = await service.submitResult(submission);
    if (visit !== currentVisit || get().gameId !== s.gameId) return;
    set((state) => ({
      result,
      submitting: false,
      seenTips: [...new Set([...state.seenTips, ...state.newTips])],
      firstGame: false,
      status: state.status && {
        ...state.status,
        todayEarned: result.todayEarned,
        isFirstGame: false,
      },
    }));
    orderSubmission = null;
    void refreshWallet(currentVisit);
  } catch (error) {
    if (visit !== currentVisit || get().gameId !== s.gameId) return;
    const retryable =
      !(error instanceof v4.BungeoppangRuleError) && (!(error instanceof BungeoppangServiceError) || error.retryable);
    set({
      submitting: false,
      submitError: {
        retryable,
        message: error instanceof Error ? error.message : "결과를 보내지 못했어요. 같은 기록으로 다시 시도해 주세요.",
      },
    });
  }
}

// ---------- 엔진 루프 ----------
let raf = 0;
function startLoop() {
  cancelAnimationFrame(raf);
  clearInterval(loopTimer);
  clock.frameAt = performance.now();
  raf = requestAnimationFrame(tick);
  loopTimer = setInterval(() => advanceBungeoppangTime(), 100);
}
function tick(now: number) {
  advanceBungeoppangTime(now);
  if (['countdown', 'play', 'ending'].includes(get().phase)) raf = requestAnimationFrame(tick);
}
export function advanceBungeoppangTime(now = performance.now()) {
  const s = get();
  clock.frameAt = now;
  if (s.phase === "countdown") {
    clock.countdown = Math.max(0, clock.playAt - now);
    if (clock.countdown <= 0) {
      set({ phase: "play" });
    }
  }
  if (get().phase === "play") {
    clock.t = Math.min(R.durationMs, Math.max(0, now - clock.playAt));
    watchSlots(get().grill!);
    if (clock.t >= R.rushFromMs) tip("RUSH");
    if (clock.t >= R.durationMs) {
      clock.ending = R.endingMs;
      set({ phase: "ending", confirmExit: false, orderPending: false, orderError: null });
      void submitBungeoppang();
    }
  }
  if (get().phase === "ending") {
    clock.ending = Math.max(0, clock.playAt + R.durationMs + R.endingMs - now);
    if (clock.ending <= 0) set({ phase: "result" });
  }
  if (!['countdown', 'play', 'ending'].includes(get().phase)) clearInterval(loopTimer);
}
function watchSlots(grill: AnyGrill) {
  const rules = isV4Grill(grill) ? get().rules : R;
  grill.slots.forEach((slot, i) => {
    if (slot.phase !== "front" && slot.phase !== "back") return;
    const level = cookLevel(slot.since, clock.t, slot.heat, rules);
    const mark = crossed[i]!;
    if (level >= R.goldenFrom && !mark.gold) {
      mark.gold = true;
      popup(i, "치익", "SIZZLE");
      tip("GOLD", i);
    }
    if (level >= R.burntFrom && !mark.burnt) {
      mark.burnt = true;
      tip("BURNT", i);
    }
  });
}

useManual.subscribe(s => { const helpOpen = s.open && s.page === "fish-bread"; if (get().helpOpen !== helpOpen) set({helpOpen}); });
