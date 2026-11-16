import { create } from "zustand";
import { useManual, openManual, closeManual, resetManual } from "../manual/manualState";
import { BUNGEOPPANG } from "./config";
import { BUNGEOPPANG_V4 } from './config';
import * as v4 from './rulesV4';
import * as v5 from './rulesV5';
import { advanceCustomerArrivalsV5, canUseCustomerOrderV5, resetCustomerArrivalsV5, useCustomerArrivalsV5 } from './customerArrivalV5';
import { holdCustomerDepartureV5, approveCustomerDepartureV5, advanceCustomerDeparturesV5,
  cancelPendingCustomerDeparturesV5 } from './customerDepartureV5';
import type { BungFeedback, FeedbackPoint } from './presentation';
import { slotScreen } from './bungeoppangView';
import { BUNG_GRILL } from './bungeoppangView';
import { customerPoint, trayPoint, trashPoint, renewalBreadShop } from './layoutV5';
import { roundClockAnchor } from './serverTime';
import { playSfx } from '../../audio/sfx';
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
import { refreshWalletAfterSettlement } from '../wallet/settlementRefresh';
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
  type BungeoppangGame,
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
  returningScene: boolean;
  tool: BreadTool;
  toolRevision: number;
  feedback: BungFeedback[];
  grill: AnyGrill | null;
  rules: Readonly<v4.BungeoppangRules>;
  orderPending: boolean;
  orderError: string | null;
  selectedCustomer: string | null;
  choosingWaste: boolean;
  wasteTarget: { kind: 'grill'; slot: number; lastAt: number | null } | { kind: 'tray'; breadId: number } | null;
  timeSyncPending: boolean;
  timeSyncError: string | null;
  gameId: string;
  status: BungeoppangStatus | null;
  statusError: string | null;
  starting: boolean;
  recovering: boolean;
  recoveryDeferred: boolean;
  startError: string | null;
  confirmExit: boolean;
  helpOpen: boolean;
  manualPaused: boolean;
  manualPausePending: boolean;
  manualPauseError: string | null;
  abandonPending: boolean;
  abandonError: string | null;
  /** ESC 다시하기: abandon 승인부터 새 판 적용까지 한 흐름으로 묶는다. */
  restarting: boolean;
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
  returningScene: false,
  tool: "batter",
  toolRevision: 0,
  feedback: [],
  grill: null,
  rules: BUNGEOPPANG_V4,
  orderPending: false,
  orderError: null,
  selectedCustomer: null,
  choosingWaste: false,
  wasteTarget: null,
  timeSyncPending: false,
  timeSyncError: null,
  gameId: "",
  statusError: null,
  starting: false,
  recovering: false,
  recoveryDeferred: false,
  startError: null,
  confirmExit: false,
  helpOpen: false,
  manualPaused: false,
  manualPausePending: false,
  manualPauseError: null,
  abandonPending: false,
  abandonError: null,
  restarting: false,
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
let v5DeliveryFeedback: { before: v4.GrillState; after: v4.GrillState; event: v4.GrillEvent; orderId: string | null } | null = null;
let timedGameId = '';
let pauseInFlight = '';
let loopTimer: ReturnType<typeof setInterval> | undefined;
let transitionTimer: ReturnType<typeof setTimeout>;
export function setBungeoppangHelp(open: boolean) {
  if (open && (get().phase === "idle" || get().phase === "leaving")) return;
  if (open) openManual("fish-bread");
  else if (useManual.getState().page === "fish-bread") closeManual();
}

/** Serialize F1 transitions and keep unknown server outcomes frozen until explicitly reconciled. */
export async function syncBungeoppangManualPause() {
  const s=get(), currentVisit=visit;
  if(!['countdown','play'].includes(s.phase)||!s.gameId||pauseInFlight===s.gameId)return;
  const desired=useManual.getState().open;
  if(desired===s.manualPaused&&!s.manualPauseError)return;
  if(!service.setManualPaused&&!service.mock){
    set({manualPauseError:'일시정지 연결을 확인하지 못했어요. 설명서를 닫고 다시 확인해주세요.'});return;
  }
  pauseInFlight=s.gameId;
  if(clock.pausedAt===null)clock.pausedAt=performance.now();
  set({manualPausePending:true,manualPauseError:null});
  try {
    while(visit===currentVisit&&get().gameId===s.gameId){
      const target=useManual.getState().open;
      try {
        const reply=await service.setManualPaused?.(s.gameId,target);
        if(visit!==currentVisit||get().gameId!==s.gameId)return;
        if(reply){
          if(reply.status!=='PLAYING'){
            timedGameId='';removeClockListeners();clock.pausedAt=null;
            set({phase:'result',manualPaused:false,manualPauseError:null,confirmExit:false,orderPending:false,orderError:null});
            orderSubmission=null;
            if(reply.status==='COMPLETED'&&reply.result){
              acceptServerResult(reply.result);void refreshWallet(currentVisit);
            } else {
              set({submitError:{retryable:false,message:'이미 종료되거나 만료된 판이에요. 새 판을 시작해 주세요.'}});
            }
            return;
          }
          Object.assign(clock,roundClockAnchor(reply.timing,reply.sample));
          clock.pausedAt=reply.sample.receivedAt;
        } else if(!target){
          const offset=performance.now()-clock.pausedAt!;
          clock.playAt+=offset;clock.countdownAt+=offset;
        }
        set({manualPaused:reply?.timing.paused??target,manualPauseError:null});
        if(target===useManual.getState().open){
          if(!get().manualPaused)clock.pausedAt=null;
          break;
        }
      } catch(error){
        if(visit!==currentVisit||get().gameId!==s.gameId)return;
        set({manualPauseError:error instanceof Error?error.message:'일시정지 상태를 다시 확인해주세요.'});
        if(target===useManual.getState().open)break;
      }
    }
  } finally {
    if(pauseInFlight===s.gameId)pauseInFlight='';
    if(visit===currentVisit&&get().gameId===s.gameId)set({manualPausePending:false});
  }
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
    if (visit === currentVisit) {
      set({ status, seenTips: status.seenTips, firstGame: status.isFirstGame });
      if (status.activeSessionId && !get().gameId) void restoreBungeoppang();
    }
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
  clearTimeout(transitionTimer);
  const session = useSession.getState();
  rememberRoamingView(session.sessionId, session.roomId);
  ++visit;
  resetCustomerArrivalsV5();
  set({ phase: renewalBreadShop ? "start" : "entering", ...initial(), status: null, seenTips: [] });
  inputState.minigameOpen = true;
  clearHeldInput();
  view.active = true;
  view.returningUntil = 0;
  startKey = '';
  submission = null;
  orderSubmission = null;
  v5DeliveryFeedback = null;
  if (document.pointerLockElement) void document.exitPointerLock();
  (document.activeElement as HTMLElement | null)?.blur?.();
  void refreshBungeoppangStatus();
  // The start panel and status request can run during the same camera transition.
  if (!renewalBreadShop) transitionTimer = setTimeout(() => {
    if (get().phase === "entering") set({ phase: "start" });
  }, R.cameraTransitionMs);
}
export function leaveBungeoppang() {
  const phase = get().phase;
  if (phase === "idle" || phase === "leaving") return;
  const returningVisit = ++visit;
  resetCustomerArrivalsV5();
  clearTimeout(transitionTimer);
  clearTimeout(tipTimer);
  cancelAnimationFrame(raf);
  clearInterval(loopTimer);
  removeClockListeners();
  timedGameId = '';
  if (get().helpOpen) resetManual();
  clock.pausedAt=null;
  view.active = false;
  const returningUntil = performance.now() + R.cameraReturnMs;
  view.returningUntil = returningUntil;
  if (renewalBreadShop) {
    // The frame loop only swaps visibility. Release the scene even when no frames run.
    const releaseScene = () => {
      if (visit !== returningVisit || !get().returningScene) return;
      const remaining = returningUntil - performance.now();
      if (remaining > 0) {
        transitionTimer = setTimeout(releaseScene, Math.ceil(remaining));
        return;
      }
      set({ returningScene: false });
    };
    transitionTimer = setTimeout(releaseScene, R.cameraReturnMs);
  }
  // Camera easing is visual only. Restore the HUD and controls in this turn,
  // after the server has acknowledged abandon when a round is active.
  inputState.minigameOpen = false;
  clearHeldInput();
  set({ phase: "idle", ...initial(), returningScene: !!renewalBreadShop });
  v5DeliveryFeedback = null;
}
/** 연결이 끊기는 등 화면을 바로 정리해야 할 때. */
export function resetBungeoppang() {
  if (get().phase === 'idle' && !get().recoveryDeferred && !view.active && !view.returningUntil) return;
  ++visit;
  resetCustomerArrivalsV5();
  clearTimeout(transitionTimer);
  clearTimeout(tipTimer);
  cancelAnimationFrame(raf);
  clearInterval(loopTimer);
  removeClockListeners();
  timedGameId = '';
  if (get().helpOpen) resetManual();
  clock.pausedAt=null;
  startKey = '';
  submission = null;
  orderSubmission = null;
  v5DeliveryFeedback = null;
  view.active = false;
  view.returningUntil = 0;
  set({ phase: "idle", ...initial(), status: null, seenTips: [] });
  inputState.minigameOpen = false;
  clearHeldInput();
}

/** A fresh page has no local grill, but the authoritative activity survives socket reconnect. */
export function watchBungeoppangRecovery() {
  let attempted = false;
  const observe = (s: ReturnType<typeof useSession.getState>, old = s) => {
    if (s.status !== 'connected' || s.sessionId !== old.sessionId || s.roomId !== old.roomId) {
      resetBungeoppang(); attempted = false;
    }
    if (s.activities[s.sessionId] !== 'BUNGEOPPANG') {
      attempted = false;
      if (get().recoveryDeferred) resetBungeoppang();
      return;
    }
    if (!attempted && s.status === 'connected' && s.mapCompatible && !s.pending && s.roomId && get().phase === 'idle') {
      // One automatic attempt per admitted activity; errors wait for the visible retry action.
      attempted = true; void restoreBungeoppang();
    }
  };
  const unsubscribe = useSession.subscribe(observe);
  observe(useSession.getState());
  return () => { unsubscribe(); resetBungeoppang(); };
}

export async function restoreBungeoppang() {
  const session = useSession.getState(), state = get();
  if (service.mock || !service.resumeGame || state.starting || state.abandonPending
    || !['idle', 'entering', 'start'].includes(state.phase) || (!state.recovering && !!state.gameId)
    || session.status !== 'connected' || !session.mapCompatible || !session.roomId || session.pending
    || (!state.recovering && !state.status?.activeSessionId && session.activities[session.sessionId] !== 'BUNGEOPPANG')) return;
  if (!state.recovering || state.recoveryDeferred) {
    ++visit;
    rememberRoamingView(session.sessionId, session.roomId);
    resetCustomerArrivalsV5();
    clearTimeout(transitionTimer);
    set({ phase: 'start', ...initial(), status: null, seenTips: [], recovering: true });
    inputState.minigameOpen = true;
    clearHeldInput();
    view.active = true; view.returningUntil = 0;
    startKey = ''; submission = null; orderSubmission = null; v5DeliveryFeedback = null;
    if (document.pointerLockElement) void document.exitPointerLock();
  }
  const currentVisit = visit;
  const current = () => visit === currentVisit && useSession.getState().sessionId === session.sessionId
    && useSession.getState().roomId === session.roomId && useSession.getState().status === 'connected';
  set({ starting: true, startError: null, abandonError: null });
  try {
    const status = await service.getStatus();
    if (!current()) return;
    set({ status, seenTips: status.seenTips, firstGame: status.isFirstGame });
    if (!status.activeSessionId) { leaveBungeoppang(); return; }
    set({ gameId: status.activeSessionId });
    const game = await service.resumeGame(status.activeSessionId);
    if (!current() || get().abandonPending) return;
    if (game.gameId !== status.activeSessionId) throw new BungeoppangServiceError('INVALID_RESPONSE', '복구할 판을 확인하지 못했어요.', true);
    applyBungeoppangGame(game, currentVisit);
  } catch (error) {
    if (!current()) return;
    if (error instanceof BungeoppangServiceError && error.code === 'GAME_NOT_ACTIVE') {
      set({ phase: 'result', recovering: false, starting: false,
        submitError: { retryable: false, message: '이미 종료되거나 만료된 판이에요. 공원으로 돌아가거나 새 판을 시작해 주세요.' } });
    } else set({ starting: false, startError: error instanceof Error ? error.message : '진행 중인 판을 복구하지 못했어요. 다시 확인해 주세요.' });
  }
}

/** Dismiss only the failed lookup UI; an unidentified server round is never implicitly abandoned. */
export function dismissBungeoppangRecovery() {
  const s = get();
  if (!s.recovering || s.starting || s.abandonPending || s.gameId) return;
  leaveBungeoppang();
  set({ recovering: true, recoveryDeferred: true, startError: s.startError });
}

// ---------- 판 시작 ----------
export async function startBungeoppang() {
  const s = get();
  if (s.recovering || s.starting || !s.status || s.submitting || s.abandonPending || (s.phase !== "start" && s.phase !== "result")
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
    if (game.rulesVersion !== R.rulesVersion && !(game.rulesVersion === 'v4' && game.v4 && service.nextOrder)
      && !(game.rulesVersion === 'v5' && game.v5 && service.deliverV5))
      throw new BungeoppangServiceError(
        "RULES_VERSION_MISMATCH",
        "게임이 업데이트됐어요. 새로고침해 주세요.",
      );
    if (get().phase !== "start" && get().phase !== "result") return;
    applyBungeoppangGame(game, currentVisit);
  } catch (error) {
    if (visit !== currentVisit) return;
    set({
      starting: false,
      startError: error instanceof Error ? error.message : "연결이 불안정해요. 같은 요청으로 다시 시도해 주세요.",
    });
    if (error instanceof BungeoppangServiceError && !error.retryable) startKey = '';
  }
}

/** New starts and reload recovery use the same authoritative clock/state installation. */
function applyBungeoppangGame(game: BungeoppangGame, currentVisit: number) {
    const sync = game.v5?.timeSync ?? game.v4?.timeSync;
    if (game.v4?.timing && !sync) throw new BungeoppangServiceError('INVALID_RESPONSE', '서버 시간을 확인하지 못했어요.', true);
    if (sync && sync.status !== 'PLAYING' && sync.status !== 'COMPLETED')
      throw new BungeoppangServiceError('GAME_NOT_ACTIVE', '이미 종료되거나 만료된 판이에요. 새 판을 시작해 주세요.');
    startKey = '';
    submission = null;
    orderSubmission = null;
    v5DeliveryFeedback = null;
    for (const c of crossed) Object.assign(c, { gold: false, burnt: false });
    for (const fx of slotFx)
      Object.assign(fx, {
        shakeAt: -1e9,
        flipAt: -1e9,
        takeAt: -1e9,
        pourAt: -1e9,
        fillAt: -1e9,
      });
    timedGameId = sync?.status === 'PLAYING' ? game.gameId : '';
    const now = performance.now();
    const roundRules = game.v5?.rules ?? game.v4?.rules ?? BUNGEOPPANG_V4;
    const anchor = sync ? roundClockAnchor(sync.timing, sync.sample)
      : { playAt: now + R.countdownMs, countdownAt: now };
    const gameTime = sync?.timing.paused ? sync.sample.receivedAt : now;
    Object.assign(clock, {
      ...anchor,
      pausedAt:sync?.timing.paused?gameTime:null,
      durationMs: roundRules.durationMs,
      t: Math.min(roundRules.durationMs, Math.max(0, gameTime - anchor.playAt)),
      frameAt: now,
      countdown: Math.max(0, anchor.playAt - gameTime),
      preparing: gameTime < anchor.countdownAt,
      ending: 0,
    });
    resetCustomerArrivalsV5(game.v5?.grill?.activeOrders ?? game.v5?.orders ?? []);
    set({
      phase: sync?.status === 'COMPLETED' ? 'result' : 'countdown',
      starting: false,
      gameId: game.gameId,
      manualPaused:sync?.timing.paused??false,
      manualPausePending:false,
      manualPauseError:null,
      recovering: false,
      recoveryDeferred: false,
      grill: game.v5 ? game.v5.grill ?? v5.createGrill(game.heats, game.v5.orders, game.v5.rules)
        : game.v4 ? game.v4.grill ?? v4.createGrill(game.heats, game.v4.order, game.v4.rules) : createGrill(game.heats, R),
      rules: Object.freeze({ ...roundRules }),
      selectedCustomer: null,
      choosingWaste: false,
      wasteTarget: null,
      orderPending: false,
      orderError: null,
      timeSyncPending: false,
      timeSyncError: null,
      tool: "batter",
      toolRevision: 0,
      feedback: [],
      firstGame: game.isFirstGame,
      confirmExit: false,
      newTips: [],
      popups: [],
      tip: null,
      result: sync?.result ?? null,
      submitError: null,
    });
    (document.activeElement as HTMLElement | null)?.blur?.();
    if (sync?.result) { acceptServerResult(sync.result); void refreshWallet(currentVisit); }
    else { tip("START"); startLoop(); advanceBungeoppangTime(); }
}

// ---------- 플레이 입력 ----------
const canAct = () => {
  advanceBungeoppangTime();
  const s = get();
  return (
    s.phase === "play" &&
    !s.timeSyncPending && !s.timeSyncError && !s.manualPaused && !s.manualPausePending && !s.manualPauseError &&
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
  const rules = isV4Grill(grill) ? get().rules : R;
  if (grill.log.length >= rules.maxLogEntries) { popup(null, '입력 기록 한도에 도달했어요. 이번 판은 추가 조작할 수 없어요.', 'PLAIN'); return; }
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
      if (v5.isV5Grill(grill)) {
        if (action === 'DELIVER') entry.orderId = get().selectedCustomer ?? undefined;
        if (action === 'TRAY_DISCARD') entry.breadId = grill.tray[slot]?.id;
        result = v5.applyAction(grill, entry, get().rules);
      } else {
        if (action === 'DELIVER') entry.order = grill.orderIndex;
        result = v4.applyAction(grill, entry, get().rules);
      }
    } else result = applyAction(grill, { slot, action: action as BreadAction, t }, R);
  } catch (error) {
    if (error instanceof Error) popup(current ? slot : null, error.message, 'PLAIN');
    return;
  }
  if (result.event.kind === 'deliver' && isV4Grill(grill) && v5.isV5Grill(grill)) {
    const customer = grill.activeOrders.find(order => order.orderId === get().selectedCustomer);
    if (customer) holdCustomerDepartureV5(customer);
  }
  set({ grill: result.state, wasteTarget: null, choosingWaste: false });
  if (result.event.kind === 'deliver' && isV4Grill(grill) && v5.isV5Grill(grill))
    v5DeliveryFeedback = { before: grill, after: result.state as v4.GrillState, event: result.event, orderId: get().selectedCustomer };
  else onEvent(result.event, grill);
  if (result.event.kind === 'deliver') {
    if (v5.isV5Grill(isV4Grill(result.state) ? result.state : null)) void requestV5Delivery();
    else void requestBungeoppangOrder();
  }
}
export function pressBungeoppangSlot(slot: number) {
  if (!Number.isInteger(slot) || slot < 0 || slot >= R.slots || !canAct()) return;
  const s = get();
  const current = s.grill!.slots[slot]!;
  if (isV4Grill(s.grill) && v5.isV5Grill(s.grill)) {
    if (v5.burnt(s.grill.slots[slot]!, gameNow(), s.rules)) { act(slot, 'DISCARD'); return; }
    if (s.choosingWaste && current.phase !== 'empty') {
      set({ wasteTarget: { kind: 'grill', slot, lastAt: current.lastAt } }); return;
    }
  }
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
  const s = get();
  if (isV4Grill(s.grill) && v5.isV5Grill(s.grill) && !canUseCustomerOrderV5(s.selectedCustomer)) return;
  if (canAct() && isV4Grill(get().grill) && !get().orderPending && !get().orderError) act(-1, 'DELIVER');
}
/** R chooses one fulfillable, arrived order; explicit delivery buttons keep their selected target. */
export function deliverMatchingBungeoppangOrder() {
  if (!canAct()) return;
  const s = get(), grill = s.grill;
  if (!isV4Grill(grill) || s.orderPending || s.orderError) return;
  if (!v5.isV5Grill(grill)) { deliverBungeoppangOrder(); return; }
  const admitted = useCustomerArrivalsV5.getState().admitted;
  const matches = grill.activeOrders.filter(order => canUseCustomerOrderV5(order.orderId) && v5.ready(grill, order))
    .sort((a, b) => admitted[a.orderId]! - admitted[b.orderId]! || a.customerSlot - b.customerSlot);
  const target = matches.find(order => order.orderId === s.selectedCustomer) ?? matches[0];
  if (!target) { popup(null, '전달할 수 있는 주문이 아직 없어요.', 'PLAIN'); return; }
  set({ selectedCustomer: target.orderId });
  deliverBungeoppangOrder();
}
export function discardBungeoppangTray(index: number) {
  if (canAct() && isV4Grill(get().grill)) act(index, 'TRAY_DISCARD');
}
export function selectBungeoppangCustomer(orderId: string) {
  const s = get();
  if (!canAct() || !isV4Grill(s.grill) || !v5.isV5Grill(s.grill)
    || !s.grill.activeOrders.some(o => o.orderId === orderId) || !canUseCustomerOrderV5(orderId)) return false;
  set({ selectedCustomer: orderId });
  return true;
}
export function toggleBungeoppangWaste() {
  if (canAct()) set(s => ({ choosingWaste: !s.choosingWaste, wasteTarget: null }));
}
export function selectBungeoppangTray(breadId: number) {
  const s = get();
  if (canAct() && isV4Grill(s.grill) && s.grill.tray.some(b => b.id === breadId))
    set({ choosingWaste: true, wasteTarget: { kind: 'tray', breadId } });
}
export function trashBungeoppangSelection() {
  if (!canAct()) return;
  const s = get(), target = s.wasteTarget;
  if (!target) { popup(null, '버릴 빵을 먼저 골라 주세요.', 'PLAIN'); return; }
  if (target.kind === 'grill') {
    const current = s.grill!.slots[target.slot];
    if (current?.phase !== 'empty' && current?.lastAt === target.lastAt) discardBungeoppangSlot(target.slot);
  } else if (isV4Grill(s.grill)) {
    const index = s.grill.tray.findIndex(b => b.id === target.breadId);
    if (index >= 0) discardBungeoppangTray(index);
  }
  set({ wasteTarget: null, choosingWaste: false });
}
/** One delivery in flight per round. Cooking suffixes continue above its immutable prefix. */
export async function requestV5Delivery() {
  const s = get();
  if (!isV4Grill(s.grill) || !v5.isV5Grill(s.grill) || s.orderPending || !service.deliverV5 || s.phase !== 'play') return;
  const currentVisit = visit;
  orderSubmission = s.orderError && orderSubmission?.gameId === s.gameId ? orderSubmission : {
    gameId: s.gameId, log: s.grill.log.map(e => ({ ...e })), clientScore: s.grill.score,
    seenTips: [...s.newTips], deliveryKey: crypto.randomUUID(),
  };
  const prefix = orderSubmission;
  set({ orderPending: true, orderError: null });
  try {
    const reply = await service.deliverV5(prefix);
    const latest = get();
    if (visit !== currentVisit || latest.gameId !== s.gameId || latest.phase !== 'play'
      || !isV4Grill(latest.grill) || !v5.isV5Grill(latest.grill)) return;
    let grill = reply.grill;
    for (const entry of latest.grill.log.slice(prefix.log.length)) {
      try { grill = v5.applyAction(grill, entry, latest.rules).state; } catch { /* Drop intent invalidated by the approved checkpoint. */ }
    }
    const selectedCustomer = grill.activeOrders.some(o => o.orderId === latest.selectedCustomer)
      ? latest.selectedCustomer : grill.activeOrders[0]?.orderId ?? null;
    orderSubmission = null;
    set({ grill, selectedCustomer, orderPending: false, orderError: null });
    if (v5DeliveryFeedback) {
      const f = v5DeliveryFeedback;
      onEvent(f.event, f.before, f.after, f.orderId); v5DeliveryFeedback = null;
    }
  } catch (error) {
    if (visit !== currentVisit || get().gameId !== s.gameId || get().phase !== 'play') return;
    if (error instanceof BungeoppangServiceError && !error.retryable && service.recoverV5) {
      try {
        const reply = await service.recoverV5(s.gameId);
        const latest = get();
        if (visit !== currentVisit || latest.gameId !== s.gameId || latest.phase !== 'play') return;
        let grill = reply.grill;
        for (const entry of latest.grill?.log.slice(prefix.log.length) ?? []) {
          try { grill = v5.applyAction(grill, entry, latest.rules).state; } catch { /* Conflicting local intent was not approved. */ }
        }
        orderSubmission = null;
        v5DeliveryFeedback = null;
        cancelPendingCustomerDeparturesV5();
        set({ grill, selectedCustomer: grill.activeOrders[0]?.orderId ?? null, orderPending: false, orderError: null });
        popup(null, '서버 상태로 복구했어요. 손님 주문을 다시 확인해 주세요.', 'PLAIN');
        return;
      } catch { /* Keep the same immutable request available for retry. */ }
    }
    if (visit === currentVisit && get().gameId === s.gameId && get().phase === 'play')
      set({ orderPending: false, orderError: error instanceof Error ? error.message : '납품 확인을 다시 시도해 주세요.' });
  }
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
      if (error.code === 'TIME_AHEAD') {
        await syncBungeoppangTime();
        if (visit !== currentVisit || get().gameId !== s.gameId || get().phase !== 'play') return;
      }
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
function onEvent(event: GrillEvent | v4.GrillEvent, before: AnyGrill, afterOverride?: AnyGrill, customerId?: string | null) {
  const v4Grill = isV4Grill(before) ? before : null;
  if (event.kind === 'deliver') {
    if (v4Grill) {
      if (v5.isV5Grill(v4Grill)) {
        const customer = v4Grill.activeOrders.find(order => order.orderId === (customerId ?? get().selectedCustomer));
        if (customer) approveCustomerDepartureV5(customer);
      }
      const after = afterOverride ?? get().grill;
      const remaining = isV4Grill(after) ? new Set(after.tray.map(b => b.id)) : new Set<number>();
      v4Grill.tray.filter(b => !remaining.has(b.id)).forEach((bread, i) => feedback({
        kind: 'deliver', filling: bread.filling, points: event.points,
        guestIndex: v5.isV5Grill(v4Grill) ? v4Grill.activeOrders.find(o => o.orderId === (customerId ?? get().selectedCustomer))?.customerSlot : v4Grill.orderIndex,
        from: elementPoint(`[data-tray-bread-id="${bread.id}"]`, { x: window.innerWidth - 130, y: 250 + i * 50 }),
        message: `${event.count}개 전달! +${event.points}점`,
        ...(v5.isV5Grill(v4Grill) ? { guestOrderId: customerId ?? get().selectedCustomer ?? undefined,
          fromWorld: trayPoint(v4Grill.tray.indexOf(bread)),
          toWorld: customerPoint(v4Grill.activeOrders.find(o => o.orderId === (customerId ?? get().selectedCustomer))?.customerSlot ?? 0)
            .map((n, axis) => n + (axis === 1 ? 1.1 : 0)) as [number, number, number] } : {}),
      }));
    }
    popup(null, `${event.count}개 전달! +${event.points}점`, 'PERFECT'); return;
  }
  if (event.kind === 'trayDiscard') {
    const bread = v4Grill?.tray[event.slot];
    if (bread) feedback({ kind: 'discard', filling: bread.filling, points: 0,
      from: elementPoint(`[data-tray-bread-id="${bread.id}"]`, { x: window.innerWidth - 130, y: 260 }),
      ...(v5.isV5Grill(v4Grill!) ? { fromWorld: trayPoint(event.slot), toWorld: trashPoint } : {}),
      message: `${v4.BREAD_NAMES[bread.filling]} 폐기 · 점수 없음` });
    popup(null, '쟁반에서 버렸어요', 'PLAIN'); return;
  }
  const fx = slotFx[event.slot]!,
    now = performance.now();
  if (event.kind === "pour") {
    fx.pourAt = now;
    playSfx('bungeo-pour');
    tip("POUR", event.slot);
  } else if (event.kind === "fill") {
    fx.fillAt = now;
    Object.assign(crossed[event.slot]!, { gold: false, burnt: false });
  } else if (event.kind === "flip") {
    fx.flipAt = now;
    playSfx('bungeo-flip');
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
        ...(v5.isV5Grill(v4Grill) ? { fromWorld: [BUNG_GRILL.slots[event.slot]![0], BUNG_GRILL.top, BUNG_GRILL.slots[event.slot]![1]] as [number, number, number],
          toWorld: event.base && isV4Grill(after) ? trayPoint(after.tray.length - 1) : trashPoint } : {}),
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
        ...(v5.isV5Grill(v4Grill) ? { burnt: v5.burnt(v4Grill.slots[event.slot]!, gameNow(), get().rules),
          fromWorld: [BUNG_GRILL.slots[event.slot]![0], BUNG_GRILL.top, BUNG_GRILL.slots[event.slot]![1]] as [number, number, number], toWorld: trashPoint } : {}),
        message: `${v4.BREAD_NAMES[filling]} 폐기 · 콤보 초기화` });
    }
    popup(event.slot, "버림", "PLAIN");
  }
}

// ---------- 나가기 확인 ----------
export function escapeBungeoppang() {
  const s = get();
  if (s.abandonPending || s.restarting) return;
  if (s.helpOpen) { setBungeoppangHelp(false); return; }
  if (s.recovering) {
    if (!s.starting) {
      if (s.gameId) set({ confirmExit: !s.confirmExit });
      else dismissBungeoppangRecovery();
    }
    return;
  }
  if (s.phase === 'result' && !s.result && s.submitError?.retryable !== false) {
    set({ confirmExit: !s.confirmExit }); return;
  }
  if (s.phase === "start" || s.phase === "result") leaveBungeoppang();
  else if (s.phase === "countdown" || s.phase === "play")
    set({ confirmExit: !s.confirmExit });
}
export function continueBungeoppang() {
  if (get().abandonPending || get().restarting) return;
  set({ confirmExit: false });
}
export async function quitBungeoppang() {
  const { gameId, phase, abandonPending, recovering, starting, restarting } = get();
  if (abandonPending || restarting) return;
  if (recovering && (starting || !gameId)) return;
  const currentVisit = visit;
  if (!gameId || (!recovering && !['countdown', 'play'].includes(phase))) { leaveBungeoppang(); return; }
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
/**
 * ESC 다시하기. 서버가 현재 판을 포기(또는 이미 무효)로 확인한 뒤에만 새 판을 시작한다.
 * idle을 거치지 않으므로 카메라·입력 소유권이 유지되고 새로고침 복구(watchBungeoppangRecovery)가 끼어들지 않는다.
 */
export async function restartBungeoppang() {
  const s = get();
  if (s.abandonPending || s.restarting || s.starting || s.recovering || s.submitting || !s.gameId || !s.status
    || !['countdown', 'play'].includes(s.phase)) return;
  const abandonVisit = visit;
  set({ abandonPending: true, abandonError: null, restarting: true });
  try {
    await service.abandon(s.gameId);
  } catch (error) {
    if (visit !== abandonVisit) return;
    const code = error instanceof BungeoppangServiceError ? error.code : '';
    // 만료 등으로 이미 무효 종료된 판은 보상이 없으므로 그대로 새 판을 시작한다.
    if (code !== 'MINIGAME_ALREADY_INVALID') {
      const completed = code === 'MINIGAME_ALREADY_COMPLETED';
      set({ abandonPending: false, restarting: false, abandonError: completed
        ? '이미 정산이 끝난 판이라 새 판을 시작하지 않았어요. 결과를 확인해 주세요.'
        : error instanceof Error ? error.message : '포기 요청을 확인하지 못했어요. 다시 시도해 주세요.' });
      const phase = get().phase;
      if (phase === 'ending' || phase === 'result') void submitBungeoppang();
      else if (completed) void syncBungeoppangTime();
      return;
    }
  }
  if (visit !== abandonVisit) return;
  // 이전 판의 루프·타이머·리스너를 끊고 visit을 올려 늦게 오는 이전 판 응답을 모두 무시한다.
  ++visit;
  resetCustomerArrivalsV5();
  clearTimeout(transitionTimer);
  clearTimeout(tipTimer);
  cancelAnimationFrame(raf);
  clearInterval(loopTimer);
  removeClockListeners();
  timedGameId = '';
  clock.pausedAt = null;
  startKey = '';
  submission = null;
  orderSubmission = null;
  v5DeliveryFeedback = null;
  const startVisit = visit;
  // status·seenTips와 화면 소유권은 유지한다. restarting 동안 HUD는 시작 안내 대신 준비 문구만 보인다.
  set({ phase: 'start', ...initial(), restarting: true });
  await startBungeoppang();
  // 실패하면 시작 안내 화면에서 오류와 재시도(같은 Idempotency-Key)·나가기를 제공한다.
  if (visit === startVisit && get().restarting) set({ restarting: false });
}

// ---------- 결과 제출 ----------
export async function submitBungeoppang() {
  const s = get();
  if (!s.grill || s.submitting || s.abandonPending || s.result || s.timeSyncPending || s.timeSyncError
    || !['ending', 'result'].includes(s.phase)) return;
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
    acceptServerResult(result);
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
function acceptServerResult(result: BungeoppangSubmitResult) {
  set((state) => ({
    result,
    submitting: false,
    submitError: null,
    seenTips: [...new Set([...state.seenTips, ...state.newTips])],
    firstGame: false,
    status: state.status && {
      ...state.status,
      todayEarned: result.todayEarned,
      isFirstGame: false,
    },
  }));
  if (!service.mock) refreshWalletAfterSettlement(useSession.getState().sessionId, `minigame:${get().gameId}`);
}

/** Re-anchor time only: keep every previously recorded action and in-flight delivery prefix intact. */
export async function syncBungeoppangTime() {
  const s = get(), currentVisit = visit;
  if (!timedGameId || timedGameId !== s.gameId || !service.syncTimeV4 || s.timeSyncPending || s.result
    || !['countdown', 'play', 'ending', 'result'].includes(s.phase)) return;
  set({ timeSyncPending: true, timeSyncError: null });
  try {
    const reply = await service.syncTimeV4(s.gameId);
    if (visit !== currentVisit || get().gameId !== s.gameId || get().result) return;
    Object.assign(clock, roundClockAnchor(reply.timing, reply.sample));
    clock.pausedAt=reply.timing.paused||get().manualPausePending||useManual.getState().open?reply.sample.receivedAt:null;
    set({manualPaused:reply.timing.paused??false});
    if (reply.status !== 'PLAYING') { timedGameId = ''; removeClockListeners(); }
    if (reply.status === 'COMPLETED' && reply.result) {
      acceptServerResult(reply.result);
      set({ phase: 'result', orderPending: false, orderError: null, confirmExit: false });
      orderSubmission = null;
      void refreshWallet(currentVisit);
    } else if (reply.status !== 'PLAYING') {
      set({ phase: 'result', confirmExit: false, orderPending: false, orderError: null,
        submitError: { retryable: false, message: '이미 종료되거나 만료된 판이에요. 새 판을 시작해 주세요.' } });
    } else if (get().phase === 'result') { set({ phase: 'ending' }); startLoop(); }
  } catch (error) {
    if (visit === currentVisit && get().gameId === s.gameId && !get().result)
      set({ timeSyncError: error instanceof Error ? error.message : '서버 시간을 다시 확인해 주세요.' });
  } finally {
    if (visit === currentVisit && get().gameId === s.gameId) {
      set({ timeSyncPending: false });
      advanceBungeoppangTime();
    }
  }
}
function onClockResume() { if (!document.hidden) void syncBungeoppangTime(); }
function removeClockListeners() {
  document.removeEventListener?.('visibilitychange', onClockResume);
  window.removeEventListener?.('online', onClockResume);
}

// ---------- 엔진 루프 ----------
let raf = 0;
function startLoop() {
  cancelAnimationFrame(raf);
  clearInterval(loopTimer);
  clock.frameAt = performance.now();
  raf = requestAnimationFrame(tick);
  loopTimer = setInterval(() => advanceBungeoppangTime(), 100);
  removeClockListeners();
  if (timedGameId) {
    document.addEventListener?.('visibilitychange', onClockResume);
    window.addEventListener?.('online', onClockResume);
  }
}
function tick(now: number) {
  advanceBungeoppangTime(now);
  if (['countdown', 'play', 'ending'].includes(get().phase)) raf = requestAnimationFrame(tick);
}
export function advanceBungeoppangTime(now = performance.now()) {
  const s = get();
  if(clock.pausedAt!==null&&['countdown','play'].includes(s.phase))return;
  advanceCustomerDeparturesV5(now);
  clock.frameAt = now;
  if (s.phase === "countdown") {
    clock.countdown = Math.max(0, clock.playAt - now);
    clock.preparing = now < clock.countdownAt;
    if (clock.countdown <= 0) {
      set({ phase: "play" });
    }
  }
  if (get().phase === "play") {
    const rules = isV4Grill(get().grill) ? get().rules : R;
    clock.t = Math.min(rules.durationMs, Math.max(0, now - clock.playAt));
    const current = get();
    if (isV4Grill(current.grill) && v5.isV5Grill(current.grill)) {
      if (!document.hidden) advanceCustomerArrivalsV5(current.grill.activeOrders, clock.t, rules.rushFromMs, rules.durationMs);
      const available = current.grill.activeOrders.filter(order => canUseCustomerOrderV5(order.orderId));
      if (!available.some(order => order.orderId === current.selectedCustomer)) {
        const selectedCustomer = available[0]?.orderId ?? null;
        if (selectedCustomer !== current.selectedCustomer) set({ selectedCustomer });
      }
    }
    watchSlots(get().grill!);
    if (clock.t >= rules.rushFromMs) tip("RUSH");
    if (clock.t >= rules.durationMs) {
      clock.ending = R.endingMs;
      set({ phase: "ending", confirmExit: false, orderPending: false, orderError: null });
      void submitBungeoppang();
    }
  }
  if (get().phase === "ending") {
    clock.ending = Math.max(0, clock.playAt + clock.durationMs + R.endingMs - now);
    if (clock.ending <= 0) set({ phase: "result" });
    const current = get();
    if (now >= clock.playAt + clock.durationMs && !current.result && !current.submitError)
      void submitBungeoppang();
  }
  if (!['countdown', 'play', 'ending'].includes(get().phase)) clearInterval(loopTimer);
}
function watchSlots(grill: AnyGrill) {
  const rules = isV4Grill(grill) ? get().rules : R;
  grill.slots.forEach((slot, i) => {
    if (slot.phase !== "front" && slot.phase !== "back" && !(isV4Grill(grill) && v5.isV5Grill(grill) && slot.phase === 'batter')) return;
    const level = cookLevel(slot.since, clock.t, slot.heat, rules);
    const mark = crossed[i]!;
    if (level >= R.goldenFrom && !mark.gold) {
      mark.gold = true;
      popup(i, "치익", "SIZZLE");
      tip("GOLD", i);
    }
    if (level >= R.burntFrom && !mark.burnt) {
      mark.burnt = true;
      playSfx('bungeo-burn');
      tip("BURNT", i);
    }
  });
}

useManual.subscribe((s,old) => {
  const helpOpen=s.open&&s.page==='fish-bread';
  if(get().helpOpen!==helpOpen)set({helpOpen});
  if(s.open!==old.open)void syncBungeoppangManualPause();
});
useBungeoppang.subscribe((s,old)=>{
  if(s.gameId!==old.gameId||s.phase==='countdown'&&old.phase!=='countdown')void syncBungeoppangManualPause();
});
