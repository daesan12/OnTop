import { create } from "zustand";
import { useManual, openManual, closeManual, resetManual } from "../manual/manualState";
import { BUNGEOPPANG } from "./config";
import {
  actionFor,
  applyAction,
  cookLevel,
  createGrill,
  type BreadAction,
  type BreadTool,
  type GrillEvent,
  type GrillState,
  type Judgement,
} from "./rules";
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
  POUR: "1이나 휠 아래로 팥을 들고, 반죽 칸을 눌러요",
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
  grill: GrillState | null;
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
  grill: null,
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
    if (game.rulesVersion !== R.rulesVersion)
      throw new BungeoppangServiceError(
        "RULES_VERSION_MISMATCH",
        "게임이 업데이트됐어요. 새로고침해 주세요.",
      );
    if (get().phase !== "start" && get().phase !== "result") return;
    startKey = '';
    submission = null;
    for (const c of crossed) Object.assign(c, { gold: false, burnt: false });
    for (const fx of slotFx)
      Object.assign(fx, {
        shakeAt: -1e9,
        flipAt: -1e9,
        takeAt: -1e9,
        pourAt: -1e9,
        fillAt: -1e9,
      });
    Object.assign(clock, {
      t: 0,
      frameAt: performance.now(),
      countdown: R.countdownMs,
      ending: 0,
      playAt: performance.now() + R.countdownMs,
    });
    set({
      phase: "countdown",
      starting: false,
      gameId: game.gameId,
      grill: createGrill(game.heats, R),
      tool: "batter",
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
  if (!canAct() || get().tool === tool) return;
  set({ tool });
}
function act(slot: number, action: BreadAction) {
  const grill = get().grill!;
  if (!Number.isInteger(slot) || slot < 0 || slot >= R.slots || grill.log.length >= R.maxLogEntries) return;
  const t = gameNow();
  const current = grill.slots[slot]!;
  // 서버가 거부할 입력은 기록하지 않는다(같은 칸 0.3초, 연타 0.05초).
  if (current.lastAt !== null && t - current.lastAt < R.sameSlotGapMs) return;
  if (
    grill.lastAt !== null &&
    (t < grill.lastAt || t - grill.lastAt < R.minGapMs)
  )
    return;
  let result;
  try {
    result = applyAction(grill, { slot, action, t }, R);
  } catch {
    // 불 세기 목록을 다 쓴 경우 등. 실제 플레이에서는 생기지 않는다.
    return;
  }
  set({ grill: result.state });
  onEvent(result.event);
}
export function pressBungeoppangSlot(slot: number) {
  if (!Number.isInteger(slot) || slot < 0 || slot >= R.slots || !canAct()) return;
  const s = get();
  const current = s.grill!.slots[slot]!;
  const action = actionFor(current.phase, s.tool);
  if (action === "NEED_BATTER" || action === "NEED_BEAN") {
    slotFx[slot]!.shakeAt = performance.now();
    popup(
      slot,
      action === "NEED_BATTER"
        ? "반죽부터 부어요 (Space / 휠 위)"
        : "팥으로 바꿔요 (1 / 휠 아래)",
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
function onEvent(event: GrillEvent) {
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
    fx.takeAt = now;
    popup(
      event.slot,
      `${event.judgement} ${event.base ? `+${event.points}` : "0점"}`,
      event.judgement,
    );
  } else {
    fx.takeAt = now;
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
  } finally { if (visit === currentVisit) set({ abandonPending: false }); }
}

// ---------- 결과 제출 ----------
export async function submitBungeoppang() {
  const s = get();
  if (!s.grill || s.submitting || s.result || !['ending', 'result'].includes(s.phase)) return;
  const currentVisit = visit;
  set({ submitting: true, submitError: null });
  try {
    submission ??= {
      gameId: s.gameId,
      log: s.grill.log.map(entry => ({ ...entry })),
      seenTips: [...s.newTips],
      clientScore: s.grill.score,
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
    void refreshWallet(currentVisit);
  } catch (error) {
    if (visit !== currentVisit || get().gameId !== s.gameId) return;
    const retryable =
      !(error instanceof BungeoppangServiceError) || error.retryable;
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
    if (clock.t >= R.durationMs && !get().abandonPending) {
      clock.ending = R.endingMs;
      set({ phase: "ending", confirmExit: false });
      void submitBungeoppang();
    }
  }
  if (get().phase === "ending") {
    clock.ending = Math.max(0, clock.playAt + R.durationMs + R.endingMs - now);
    if (clock.ending <= 0) set({ phase: "result" });
  }
  if (!['countdown', 'play', 'ending'].includes(get().phase)) clearInterval(loopTimer);
}
function watchSlots(grill: GrillState) {
  grill.slots.forEach((slot, i) => {
    if (slot.phase !== "front" && slot.phase !== "back") return;
    const level = cookLevel(slot.since, clock.t, slot.heat, R);
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
