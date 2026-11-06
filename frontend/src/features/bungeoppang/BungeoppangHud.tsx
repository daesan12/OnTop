import { useEffect, useState, type CSSProperties } from "react";
import { BUNGEOPPANG, BUNGEOPPANG_V4, BUNGEOPPANG_V5, bungeoppangV4Preview, bungeoppangV5Preview, bungeoppangV5Enabled } from "./config";
import { isV5Grill } from './rulesV5';
import { BungeoppangHudV5 } from './BungeoppangHudV5';
import { BREAD_NAMES, BREAD_TOOLS, BREAD_FILLINGS, orderReady, trayCounts, orderSize, type BreadTool } from './rulesV4';
import type { GrillSlot } from "./rules";
import { heatLook } from './presentation';
import { BungeoppangBurner } from './BungeoppangBurner';
import { v5HeatEls } from './layoutV5';
import { BreadToken, CustomerScene, FeedbackFlights, ToolFeedback, TrashBin, ingredientStyle } from './BungeoppangFeedback';
import { inputState } from "../../world/inputOwnership";
import {
  bungeoppangClock as clock,
  slotOverlayEls,
  slotScreen,
} from "./bungeoppangView";
import {
  TIP_TEXT,
  continueBungeoppang,
  discardBungeoppangSlot,
  escapeBungeoppang,
  leaveBungeoppang,
  pressBungeoppangSlot,
  quitBungeoppang,
  restartBungeoppang,
  dismissBungeoppangRecovery,
  restoreBungeoppang,
  watchBungeoppangRecovery,
  refreshBungeoppangStatus,
  refreshBungeoppangWallet,
  setBungeoppangHelp,
  setBungeoppangTool,
  startBungeoppang,
  useBungeoppang,
  isV4Grill,
  cycleBungeoppangTool,
  deliverBungeoppangOrder,
  deliverMatchingBungeoppangOrder,
  discardBungeoppangTray,
  requestBungeoppangOrder,
  syncBungeoppangTime,
  syncBungeoppangManualPause,
  type BungPopup,
} from "./store";
import "./bungeoppang.css";
import "./bungeoppangFeedback.css";
import './bungeoppangV5.css';
import './bungeoppangStart.css';
import coinIcon from '../../assets/entry/yeopjeon-icon.webp';
import { BungeoppangResult } from './BungeoppangResult';

const R = BUNGEOPPANG;
const SLOT_CODES = ["KeyQ", "KeyW", "KeyE", "KeyA", "KeyS", "KeyD"];
const typing = () => {
  const active = document.activeElement;
  return (
    active instanceof HTMLElement &&
    (active.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName))
  );
};

/** 붕어빵 미니게임 화면. 3D 철판은 BungeoppangGrill, 여기는 HUD·패널·입력이다. */
export function BungeoppangHud() {
  const phase = useBungeoppang((s) => s.phase);
  const recovering = useBungeoppang(s => s.recovering);
  const deferred = useBungeoppang(s => s.recoveryDeferred);
  const restarting = useBungeoppang(s => s.restarting);
  const v5 = useBungeoppang(s => isV4Grill(s.grill) && isV5Grill(s.grill));
  useMinigameInput(phase !== "idle");
  useEffect(watchBungeoppangRecovery, []);
  if (phase === "idle") return deferred ? <BungeoppangRecoveryNotice /> : null;
  const playing =
    phase === "countdown" || phase === "play" || phase === "ending";
  return (
    <div className="bung-root" data-phase={phase} data-version={v5 || bungeoppangV5Preview ? 'v5' : 'v4'} aria-label="붕어빵 굽기"
      onDragStartCapture={event => event.preventDefault()}>
      {playing && !v5 && <PlayHud />}
      {playing && (v5 ? <BungeoppangHudV5 /> : <OrderTray />)}
      {playing && <SlotOverlays />}
      <TimeSyncStatus />
      <Popups />
      <FeedbackFlights />
      {!v5 && <TipBubble />}
      {phase === "start" && (recovering ? <RecoveryPanel /> : restarting
        ? <div className="bung-big-text bung-restarting" role="status">새 판 준비 중…</div> : <StartPanel />)}
      {phase === "countdown" && <Countdown />}
      {phase === "ending" && <div className="bung-big-text">끝!</div>}
      {phase === "result" && <BungeoppangResult />}
      <ExitConfirm />
      {(bungeoppangV4Preview || bungeoppangV5Preview) && <div className="bung-preview-note">{bungeoppangV5Preview ? 'v5' : 'v4'} 개발 미리보기 · 실제 엽전 지급 없음</div>}
      {phase !== 'leaving' && phase !== 'result' && phase !== 'start' && <button className="bung-help-button" onClick={() => setBungeoppangHelp(true)}>F1 조작 안내</button>}
    </div>
  );
}

export function BungeoppangRecoveryNotice() {
  return <aside className="bung-recovery-notice" aria-label="붕어빵 복구 대기">
    <div><strong>붕어빵 복구 대기</strong><p>진행 중인 판 확인 전에는 이동이 제한될 수 있어요.</p></div>
    <button type="button" onClick={() => void restoreBungeoppang()}>다시 불러오기</button>
  </aside>;
}

export function RecoveryPanel() {
  const { starting, startError, gameId, abandonPending, abandonError } = useBungeoppang();
  return <section className="bung-panel bung-start" aria-label="진행 중인 붕어빵 복구">
    <h2>붕어빵 굽기 이어하기</h2>
    <p role="status">{starting ? '진행 중인 판과 남은 시간을 확인하고 있어요…' : '연결을 확인한 뒤 같은 판을 다시 불러와 주세요.'}</p>
    <p>서버가 승인한 기록부터 이어져요. 아직 전송하지 않은 조리 입력은 복구되지 않을 수 있어요.</p>
    {startError && <p className="bung-error" role="alert">{startError}</p>}
    <button type="button" className="bung-primary" disabled={starting || abandonPending} onClick={() => void restoreBungeoppang()}>다시 불러오기</button>
    <button type="button" disabled={starting || abandonPending}
      onClick={gameId ? escapeBungeoppang : dismissBungeoppangRecovery}>
      {gameId ? '그만두고 공원으로' : '공원 화면 보기'}
    </button>
    {abandonError && <p className="bung-error" role="alert">{abandonError}</p>}
  </section>;
}

function TimeSyncStatus() {
  const pending = useBungeoppang(s => s.timeSyncPending || s.manualPausePending);
  const pauseError=useBungeoppang(s=>s.manualPauseError);
  const error = useBungeoppang(s => s.manualPauseError ?? s.timeSyncError);
  if (!pending && !error) return null;
  return <div className="bung-time-sync" role="status">
    {pending ? '게임 시간을 확인하고 있어요…' : error}
    {!pending && error && <button type="button" onClick={() => void (pauseError?syncBungeoppangManualPause():syncBungeoppangTime())}>시간 다시 확인</button>}
  </div>;
}

function useMinigameInput(active: boolean) {
  useEffect(() => {
    if (!active) return;
    let wheelSum = 0,
      wheelLock = 0;
    let composing = false;
    const compositionStart = () => { composing = true; wheelSum = 0; };
    const compositionEnd = () => { composing = false; };
    const keydown = (event: KeyboardEvent) => {
      if (
        typing() || composing ||
        event.isComposing ||
        event.keyCode === 229 ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        inputState.manualOpen ||
        inputState.chatOpen ||
        document.querySelector('dialog[open], [role="dialog"]')
      )
        return;
      const consume = () => {
        event.preventDefault();
        event.stopImmediatePropagation();
      };
      if (event.code === "Escape") {
        consume();
        if (!event.repeat) escapeBungeoppang();
        return;
      }
      // Space는 버튼 누르기·화면 스크롤·점프 대신 반죽 들기다.
      if (event.code === "Space") {
        consume();
        if (!event.repeat) setBungeoppangTool("batter");
        return;
      }
      const digit = /^(?:Digit|Numpad)([1-4])$/.exec(event.code);
      if (digit) {
        consume();
        if (!event.repeat) setBungeoppangTool(BREAD_FILLINGS[Number(digit[1]) - 1]!);
        return;
      }
      if (event.code === 'KeyR' && isV4Grill(useBungeoppang.getState().grill)) {
        consume();
        if (!event.repeat) deliverMatchingBungeoppangOrder();
        return;
      }
      const slot = SLOT_CODES.indexOf(event.code);
      if (slot >= 0) {
        consume();
        if (event.repeat) return;
        if (event.shiftKey) discardBungeoppangSlot(slot);
        else pressBungeoppangSlot(slot);
      }
    };
    const wheel = (event: WheelEvent) => {
      const target = event.target as Element | null;
      if (
        !(target instanceof HTMLCanvasElement) &&
        !target?.closest?.(".bung-root")
      )
        return;
      // 준비 안내는 기본 휠 스크롤을 사용하고, 조리 중에만 재료를 바꾼다.
      if (useBungeoppang.getState().phase === "start" && target?.closest?.(".bung-start")) return;
      if (
        inputState.manualOpen ||
        inputState.chatOpen ||
        typing() || composing || useBungeoppang.getState().confirmExit ||
        document.querySelector('dialog[open], [role="dialog"], [role="alertdialog"]')
      )
        return;
      // 게임 중 휠은 카메라 줌·화면 스크롤 대신 재료 바꾸기다.
      event.preventDefault();
      event.stopImmediatePropagation();
      if (useBungeoppang.getState().phase !== "play") return;
      const now = performance.now();
      if (now < wheelLock) return;
      wheelSum += event.deltaY;
      if (Math.abs(wheelSum) >= 40) {
        cycleBungeoppangTool(wheelSum);
        wheelSum = 0;
        wheelLock = now + 150;
      }
    };
    window.addEventListener("keydown", keydown, true);
    window.addEventListener('compositionstart', compositionStart, true);
    window.addEventListener('compositionend', compositionEnd, true);
    window.addEventListener("wheel", wheel, { capture: true, passive: false });
    return () => {
      window.removeEventListener("keydown", keydown, true);
      window.removeEventListener('compositionstart', compositionStart, true);
      window.removeEventListener('compositionend', compositionEnd, true);
      window.removeEventListener("wheel", wheel, true);
    };
  }, [active]);
}

/** 타이머·배너처럼 시간에 따라 바뀌는 표시만 초당 10번 다시 그린다. */
function useTick(ms = 100) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), ms);
    return () => clearInterval(timer);
  }, [ms]);
}

function PlayHud() {
  useTick();
  const phase = useBungeoppang((s) => s.phase);
  const score = useBungeoppang((s) => s.grill?.score ?? 0);
  const combo = useBungeoppang((s) => s.grill?.combo ?? 0);
  const tool = useBungeoppang((s) => s.tool);
  const v4 = useBungeoppang((s) => isV4Grill(s.grill));
  const rules = useBungeoppang(s => s.rules);
  const v5 = useBungeoppang(s => isV4Grill(s.grill) && isV5Grill(s.grill));
  const t = clock.t;
  const warn = phase === "play" && t >= rules.rushFromMs - 3000 && t < rules.rushFromMs;
  const rush = phase !== "countdown" && t >= rules.rushFromMs;
  const left = Math.max(0, (clock.durationMs - t) / 1000);
  return (
    <>
      <div className={v5 ? 'bung-v5-accessibility' : undefined}>
      <div
        className="bung-edge"
        data-state={warn ? "warn" : rush ? "rush" : "off"}
      />
      <div
        className="bung-timer"
        data-rush={rush}
        role="timer"
        aria-label="남은 시간"
      >
        {left >= 10 ? Math.ceil(left) : left.toFixed(1)}
        <small>초</small>
      </div>
      <div className="bung-score">
        <span>
          점수 · 미리보기 <b>{score}</b>
        </span>
        <span>
          콤보 <b>{combo}</b>
          {combo >= 3 && <em>×{combo >= 6 ? "1.5" : "1.2"}</em>}
        </span>
      </div>
      {warn && (
        <div className="bung-banner" role="alert">
          손님이 몰려와요! {Math.ceil((rules.rushFromMs - t) / 1000)}
        </div>
      )}
      {rush && t < rules.rushFromMs + 1800 && (
        <div className="bung-banner" role="alert">
          손님 몰림! 불이 세졌어요
        </div>
      )}
      <div className="bung-tools" aria-label="손에 든 재료">
        <span className="bung-tools-label">손에 든 재료</span>
        {(v4 ? BREAD_TOOLS : ['batter', 'bean'] as const).map((item, i) => <button
          key={item} type="button" data-active={tool === item} aria-pressed={tool === item} style={ingredientStyle(item)}
          onClick={() => setBungeoppangTool(item)} tabIndex={-1}>
          <i className="bung-ingredient-dot" aria-hidden="true" />{BREAD_NAMES[item]} <kbd>{i === 0 ? 'Space' : i}</kbd>
        </button>)}
        <span className="bung-tools-label">휠 위·아래로도 바꿔요</span>
      </div>
      {v4 && <ToolFeedback />}
      </div>
    </>
  );
}

function OrderTray() {
  const grill = useBungeoppang(s => s.grill);
  const phase = useBungeoppang(s => s.phase);
  const pending = useBungeoppang(s => s.orderPending);
  const error = useBungeoppang(s => s.orderError);
  const blocked = useBungeoppang(s => s.confirmExit || s.helpOpen || s.abandonPending);
  const rules = useBungeoppang(s => s.rules);
  if (!isV4Grill(grill)) return null;
  const order = grill.order, counts = trayCounts(grill);
  const ready = orderReady(grill), active = phase === 'play' && !blocked;
  return <>
    <section className="bung-customer bung-panel" aria-label="손님 주문" data-customer={grill.orderIndex + 1}>
      <h2>{grill.orderIndex + 1}번 손님</h2>
      <CustomerScene index={grill.orderIndex} hasOrder={!!order} ready={ready} pending={pending} />
      {order ? <>
        <p>총 {orderSize(order)}개 부탁해요!</p>
        <ul>{BREAD_FILLINGS.filter(f => order.items[f] > 0).map(f => <li key={f} data-ready={counts[f] >= order.items[f]}>
          <span style={ingredientStyle(f)}><i className="bung-ingredient-dot" aria-hidden="true" />{BREAD_NAMES[f]} {order.items[f]}개</span><small>준비 {Math.min(counts[f], order.items[f])}/{order.items[f]}</small>
          {(f === 'pizza' || f === 'chocolate') && <small>납품 보너스 +{rules.specialBonusPercent}%</small>}
        </li>)}</ul>
      </> : <p role="status">{pending ? '다음 손님 주문을 받는 중…' : '다음 주문 대기'}</p>}
      {error && <p className="bung-error" role="alert">{error} <button disabled={!active || pending} onClick={() => void requestBungeoppangOrder()}>주문 다시 받기</button></p>}
      <button className="bung-primary" disabled={!active || !ready || pending || !!error} onClick={deliverBungeoppangOrder}>주문 전달하기 <kbd>R</kbd></button>
      <p>{ready ? '쟁반에서 주문 수량만 전달해요' : '종류와 수량을 모두 맞춰요'}</p>
    </section>
    <section className="bung-tray bung-panel" aria-label="완성품 쟁반" data-count={grill.tray.length}>
      <h2>완성품 쟁반 <small>{grill.tray.length}/{rules.trayCapacity}</small></h2>
      <ol>{Array.from({ length: rules.trayCapacity }, (_, i) => {
        const bread = grill.tray[i];
        return <li key={bread?.id ?? `empty-${i}`} data-filling={bread?.filling ?? 'empty'} data-tray-bread-id={bread?.id} style={bread ? ingredientStyle(bread.filling) : undefined}>{bread ? <>
          <BreadToken tool={bread.filling} />
          <span>{BREAD_NAMES[bread.filling]}<small>{bread.points}점 보관</small></span>
          <button aria-label={`쟁반 ${i + 1} ${BREAD_NAMES[bread.filling]} 버리기`} disabled={!active} onClick={() => discardBungeoppangTray(i)}>버리기</button>
        </> : <span><small>{i + 1}</small>빈 자리</span>}</li>;
      })}</ol>
      <p>{grill.tray.length === rules.trayCapacity ? '가득 찼어요. 전달하거나 버려요.' : '미리 구워도 좋아요. 전달해야 득점!'}</p>
      <TrashBin />
    </section>
  </>;
}

function actionLabel(slot: GrillSlot, tool: BreadTool) {
  if (slot.phase === "empty")
    return tool === "batter" ? ["반죽 붓기", true] : ["반죽부터", false];
  if (slot.phase === "batter")
    return tool !== "batter" ? [`${BREAD_NAMES[tool]} 넣기`, true] : ["소로 바꾸기", false];
  return slot.phase === "front" ? ["뒤집기", true] : ["꺼내기 (뒷면)", true];
}
function SlotOverlays() {
  const slots = useBungeoppang((s) => s.grill?.slots);
  const tool = useBungeoppang((s) => s.tool);
  const hover = useBungeoppang((s) => s.hover);
  const firstGame = useBungeoppang((s) => s.firstGame);
  const phase = useBungeoppang((s) => s.phase);
  const confirmExit = useBungeoppang((s) => s.confirmExit);
  const rules = useBungeoppang(s => s.rules);
  const v5 = useBungeoppang(s => isV4Grill(s.grill) && isV5Grill(s.grill));
  if (!slots) return null;
  return (
    <>
      {slots.map((slot, i) => {
        const heat = heatLook(slot.heat, clock.t, rules);
        const [label, ok] = actionLabel(slot, tool);
        const showLabel =
          phase === "play" && !confirmExit && (hover === i || (firstGame && i === 0 && slot.phase === 'empty'));
        if (v5) return <div key={i} className="bung-slot bung25-slot bung-v5-heat-cell" data-row={i < 3 ? 'back' : 'front'}
          ref={el => { slotOverlayEls[i] = el; v5HeatEls[i] = el; }}>
          <span className="bung25-slot-key">{R.slotKeys[i]}</span>
          <span className="bung25-slot-name">{slot.phase === 'empty' ? '반죽 붓기' : slot.phase === 'batter' ? '소 넣기'
            : `${'filling' in slot && slot.filling ? BREAD_NAMES[slot.filling] : ''} · ${slot.phase === 'front' ? '뒤집기' : '꺼내기'}`}</span>
          <BungeoppangBurner slot={i} />
          <div className="bung25-cell-meter">
            <span className="bung25-fire" aria-hidden="true">{[0, 1, 2].map(n => <svg key={n} viewBox="0 0 14 20"><path d="M8 1C9 6 14 8 13 13 13 21 1 21 1 13 1 9 5 7 5 4 5 8 8 9 8 1Z" /></svg>)}</span><b className="bung-v5-heat-label">꺼짐</b>
            <strong className="bung-v5-heat-value">—</strong><span className="bung-v5-heat-speed bung-v5-accessibility" />
            <span className="bung-gauge" role="progressbar" aria-label={`${R.slotKeys[i]} 현재 면 익힘`} aria-valuemin={0} aria-valuemax={100}><span className="bung-gauge-fill" /></span>
            <small className="bung-v5-cook-state bung-v5-accessibility" />
          </div>
          <span className="bung-cook-readout" />
        </div>;
        return (
          <div
            key={i}
            className="bung-slot"
            data-row={i < 3 ? 'back' : 'front'}
            ref={(el) => {
              slotOverlayEls[i] = el;
            }}
          >
            <span className="bung-slot-key">{R.slotKeys[i]}</span>
            {'filling' in slot && slot.filling && <>
              <span className="bung-slot-filling" style={ingredientStyle(slot.filling)}><i className="bung-ingredient-dot" aria-hidden="true" />{BREAD_NAMES[slot.filling]}{hover === i && <em> · {slot.phase === 'front' ? '뒤집기' : '꺼내기'}</em>}</span>
              <span className="bung-heat" data-heat={heat.band} data-rush={heat.rush}>
                <span className="bung-flames" aria-hidden="true">{[1, 2, 3].map(n => <i key={n} data-lit={n <= heat.flames} />)}</span>
                <b>{heat.label} {slot.heat}%</b><small className="bung-heat-speed">굽기 ×{heat.speed.toFixed(2)}</small>
              </span>
            </>}
            {v5 && slot.phase === 'batter' && <span className="bung-heat" data-heat={heat.band}>
              <b>{heat.label} {slot.heat}%</b><small className="bung-heat-speed">굽기 ×{heat.speed.toFixed(2)}</small>
            </span>}
            {showLabel && !('filling' in slot && slot.filling) && (
              <span className="bung-slot-label" data-ok={ok}>
                {label}
              </span>
            )}
            <span className="bung-steam" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span className="bung-gauge" role="progressbar" aria-label={`${R.slotKeys[i]} 현재 면 익힘`} aria-valuemin={0} aria-valuemax={100}>
              <span className="bung-gauge-fill" />
            </span>
            <span className="bung-cook-readout" />
          </div>
        );
      })}
    </>
  );
}

function Popups() {
  const popups = useBungeoppang((s) => s.popups);
  return (
    <>
      {popups.map((p: BungPopup) => {
        const at =
          p.slot === null
            ? { x: window.innerWidth / 2, y: window.innerHeight * 0.34 }
            : slotScreen[p.slot]!;
        return (
          <div
            key={p.id}
            className="bung-popup"
            data-tone={p.tone}
            style={{ left: at.x, top: at.y - 18 } as CSSProperties}
          >
            {p.text}
          </div>
        );
      })}
    </>
  );
}

function TipBubble() {
  const tip = useBungeoppang((s) => s.tip);
  if (!tip) return null;
  // 화면 전체 안내는 몰림 배너 아래, 칸 안내는 칸의 동작 이름 위에 둔다.
  const style =
    tip.slot === null
      ? { left: window.innerWidth / 2, top: window.innerHeight * 0.3 }
      : {
          left: `clamp(170px, ${slotScreen[tip.slot]!.x}px, calc(100vw - 170px))`,
          top:
            slotScreen[tip.slot]!.y - slotScreen[tip.slot]!.width * 0.42 - 26,
        };
  return (
    <div className="bung-tip" role="status" style={style as CSSProperties}>
      {TIP_TEXT[tip.key]}
    </div>
  );
}

const START_STEPS = [
  { title: '익는 상태를 보고', description: '붕어빵이 익어가는 모습을 확인해요.', alt: '철판 위에서 익어가는 붕어빵과 익힘 게이지' },
  { title: '클릭해서 뒤집기', description: '타이밍에 맞춰 클릭하면 뒤집어져요.', alt: '뒤집개로 노릇한 붕어빵을 뒤집는 모습' },
  { title: '양쪽이 익으면 완성!', description: '양쪽이 노릇하게 익으면 완성돼요.', alt: '양쪽이 노릇하게 완성된 붕어빵' },
] as const;
function Steps() {
  return <ol className="bung-start-steps" aria-label="붕어빵 굽는 방법">
    {START_STEPS.map((step, index) => <li key={step.title}>
      <div className="bung-start-step-heading">
        <span className="bung-start-step-number" aria-hidden="true">{index + 1}</span>
        <div><h3>{step.title}</h3><p>{step.description}</p></div>
      </div>
      <img src={`/art/bungeoppang/start-step-${index + 1}.webp`} alt={step.alt} width="800" height="686" />
    </li>)}
  </ol>;
}
function StartPanel() {
  const status = useBungeoppang((s) => s.status);
  const statusError = useBungeoppang((s) => s.statusError);
  const starting = useBungeoppang((s) => s.starting);
  const startError = useBungeoppang((s) => s.startError);
  const walletError = useBungeoppang((s) => s.walletError);
  const capped = !!status && status.todayEarned >= status.dailyCap;
  const v5 = status ? status.rulesVersion === 'v5' : bungeoppangV5Enabled;
  const readyRules = v5 ? BUNGEOPPANG_V5 : BUNGEOPPANG_V4;
  return (
    <section className="bung-panel bung-start" aria-label="붕어빵 굽기 시작" tabIndex={0}>
      <header className="bung-start-title">
        <span className="bung-start-cloud" aria-hidden="true"><CloudDecoration /></span>
        <h2><img src="/art/bungeoppang/result-fish.webp" alt="" width="76" height="50" />붕어빵 굽기</h2>
        <span className="bung-start-cloud" aria-hidden="true"><CloudDecoration /></span>
      </header>
      <p className="bung-start-intro">제한 시간 동안 붕어빵을 빠르고 정확하게 뒤집어 양쪽이 모두 익으면 완성!</p>
      <Steps />
      <section className="bung-start-controls" aria-label="붕어빵 조작과 점수 안내">
        <div className="bung-start-plates" aria-label="굽는 틀 선택">
          <h3>굽는 틀 선택</h3>
          <div className="bung-start-key-row"><span>위쪽</span>{R.slotKeys.slice(0, 3).map(key => <kbd key={key}>{key.toUpperCase()}</kbd>)}</div>
          <div className="bung-start-key-row"><span>아래쪽</span>{R.slotKeys.slice(3).map(key => <kbd key={key}>{key.toUpperCase()}</kbd>)}</div>
        </div>
        <div className="bung-start-fillings">
          <h3>반죽·소 선택</h3>
          <ul>{BREAD_FILLINGS.map((filling, index) => <li key={filling}><kbd>{index + 1}</kbd>{BREAD_NAMES[filling]}</li>)}</ul>
          <p><kbd>Space</kbd> 반죽 선택</p>
        </div>
        <div className="bung-start-serve">
          <h3>손님에게 전달</h3>
          <p><kbd>R</kbd> 준비된 주문 전달</p>
          <p>주문 종류·수량을 맞춰요.</p>
          <p>손님 클릭으로도 전달해요.</p>
        </div>
        <div className="bung-start-score" aria-label="점수와 랭킹 안내">
          <h3>점수·랭킹</h3>
          <div className="bung-start-combo" aria-label="붕어빵 콤보 안내">
            <h4>황금빛 콤보</h4>
            <p><b>3콤보 ×1.2 · 6콤보 ×1.5</b></p>
          </div>
          <p className="bung-start-bonus"><b>피자·초코</b> 보너스 +{readyRules.specialBonusPercent}%</p>
          {v5 && <p className="bung-start-complaint"><b>컴플레인</b> −{BUNGEOPPANG_V5.queueComplaintPenalty}점</p>}
          <p className="bung-start-ranking">최고 점수로 랭킹에 도전해요!</p>
        </div>
      </section>
      <p className="bung-start-earned" aria-label={`오늘 번 엽전 ${status ? `${status.todayEarned}냥` : '확인 중'} / ${status?.dailyCap ?? R.dailyCoinCap}냥`}>
        <span>미니게임 오늘</span><span className="bung-start-amount">{!status ? '수익 확인 중' : <><img src={coinIcon} alt="" width="28" height="28" />{status.todayEarned.toLocaleString()}냥</>}</span>
        <span aria-hidden="true">/</span>
        <strong className="bung-start-amount"><img src={coinIcon} alt="" width="28" height="28" />{status?.dailyCap ?? R.dailyCoinCap}냥</strong>
      </p>
      {capped && (
        <p className="bung-cap">오늘 미니게임 보상 한도에 도달했어요. 게임은 계속할 수 있어요.</p>
      )}
      {statusError && <p className="bung-error" role="alert">{statusError} <button onClick={() => void refreshBungeoppangStatus()}>상태 다시 확인</button></p>}
      {walletError && <p className="bung-error" aria-live="polite">{walletError} <button onClick={() => void refreshBungeoppangWallet()}>잔액 다시 확인</button></p>}
      <button
        type="button"
        className="bung-primary"
        onClick={(e) => {
          e.currentTarget.blur();
          void startBungeoppang();
        }}
        disabled={starting || !status}
      >
        {starting ? "준비 중…" : "시작"}
      </button>
      {startError && (
        <p className="bung-error" role="alert">
          {startError}
        </p>
      )}
      <footer>
        <button type="button" className="bung-start-exit" aria-label="ESC 나가기" aria-keyshortcuts="Escape" onClick={leaveBungeoppang}>
          <kbd>ESC</kbd><span>나가기</span>
        </button>
      </footer>
    </section>
  );
}

function CloudDecoration() {
  return <svg viewBox="0 0 180 52" fill="none" aria-hidden="true">
    <path d="M4 39h57c17 0 17-12 0-12H39c-11 0-11-10 0-10h73c15 0 15-11 6-11-7 0-8 6-3 6M61 31h15M17 39h-6" stroke="currentColor" strokeWidth="8" strokeLinecap="round" />
    <path d="M92 17h83" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>;
}

function Countdown() {
  useTick(100);
  const c = clock.countdown;
  const text = clock.preparing ? '준비 중…' : c > 2500 ? "3" : c > 1500 ? "2" : c > 500 ? "1" : "시작!";
  return (
    <div className="bung-big-text" aria-live="assertive">
      {text}
    </div>
  );
}

function ExitConfirm() {
  const open = useBungeoppang((s) => s.confirmExit);
  const phase = useBungeoppang(s => s.phase);
  const pending = useBungeoppang(s => s.abandonPending);
  const restarting = useBungeoppang(s => s.restarting);
  const error = useBungeoppang(s => s.abandonError);
  const recovering = useBungeoppang(s => s.recovering);
  if (!open) return null;
  // 다시하기는 진행 중인 판에서만 제공한다. 결과 화면에는 '다시 도전'이 있고 복구 중에는 판 상태가 없다.
  const canRestart = !recovering && (phase === 'countdown' || phase === 'play');
  return (
    <div className="bung-dim">
      <section
        className="bung-panel bung-confirm"
        role="alertdialog"
        aria-label="그만두기 확인"
      >
        <h2>그만둘까요?</h2>
        <p>{phase === 'result' ? '정산 결과를 아직 확인하지 못했어요. 나가면 이 화면의 재시도 기록을 잃습니다.'
          : canRestart ? '그만두거나 다시 시작하면 이번 판의 점수와 보상은 사라져요.' : '그만두면 이번 판은 포기 처리돼요. 타이머는 계속 흘러요.'}</p>
        {pending && <p role="status" className="bung-confirm-status">{restarting ? '이번 판을 정리하고 새 판을 준비하고 있어요…' : '포기 처리를 확인하고 있어요…'}</p>}
        {error && <p role="alert" className="bung-error">{error}</p>}
        <div className="bung-confirm-actions">
          {canRestart && (
            <button type="button" className="bung-confirm-restart" disabled={pending} onClick={() => void restartBungeoppang()}>
              {restarting ? '새 판 준비 중…' : '다시하기'}
            </button>
          )}
          <button type="button" className="bung-confirm-quit" disabled={pending} onClick={() => void quitBungeoppang()}>
            {pending && !restarting ? '포기 확인 중…' : '그만두기'}
          </button>
          <button
            type="button"
            className="bung-confirm-continue"
            onClick={continueBungeoppang}
            autoFocus
            disabled={pending}
          >
            계속하기
          </button>
        </div>
      </section>
    </div>
  );
}
