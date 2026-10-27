import { useEffect, useState, type CSSProperties } from "react";
import { BUNGEOPPANG, bungeoppangV4Preview } from "./config";
import { BREAD_NAMES, BREAD_TOOLS, BREAD_FILLINGS, orderReady, trayCounts, orderSize, type BreadTool } from './rulesV4';
import type { GrillSlot } from "./rules";
import { heatLook } from './presentation';
import { BreadToken, CustomerScene, FeedbackFlights, ToolFeedback, TrashBin, ingredientStyle } from './BungeoppangFeedback';
import { inputState } from "../../world/inputOwnership";
import { useSession } from "../../network/worldClient";
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
  resetBungeoppang,
  refreshBungeoppangStatus,
  refreshBungeoppangWallet,
  setBungeoppangHelp,
  setBungeoppangTool,
  startBungeoppang,
  submitBungeoppang,
  useBungeoppang,
  isV4Grill,
  cycleBungeoppangTool,
  deliverBungeoppangOrder,
  discardBungeoppangTray,
  requestBungeoppangOrder,
  syncBungeoppangTime,
  type BungPopup,
} from "./store";
import "./bungeoppang.css";
import "./bungeoppangFeedback.css";

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
  useMinigameInput(phase !== "idle");
  useEffect(() => {
    const unsubscribe = useSession.subscribe((s, old) => {
      if (s.status !== "connected" || s.sessionId !== old.sessionId || s.roomId !== old.roomId) resetBungeoppang();
    });
    return () => {
      unsubscribe();
      resetBungeoppang();
    };
  }, []);
  if (phase === "idle") return null;
  const playing =
    phase === "countdown" || phase === "play" || phase === "ending";
  return (
    <div className="bung-root" data-phase={phase} aria-label="붕어빵 굽기">
      {playing && <PlayHud />}
      {playing && <OrderTray />}
      {playing && <SlotOverlays />}
      <TimeSyncStatus />
      <Popups />
      <FeedbackFlights />
      <TipBubble />
      {phase === "start" && <StartPanel />}
      {phase === "countdown" && <Countdown />}
      {phase === "ending" && <div className="bung-big-text">끝!</div>}
      {phase === "result" && <ResultPanel />}
      <ExitConfirm />
      {bungeoppangV4Preview && <div className="bung-preview-note">v4 개발 미리보기 · 실제 엽전 지급 없음</div>}
      {phase !== 'leaving' && <button className="bung-help-button" onClick={() => setBungeoppangHelp(true)}>F1 조작 안내</button>}
    </div>
  );
}

function TimeSyncStatus() {
  const pending = useBungeoppang(s => s.timeSyncPending);
  const error = useBungeoppang(s => s.timeSyncError);
  if (!pending && !error) return null;
  return <div className="bung-time-sync" role="status">
    {pending ? '게임 시간을 확인하고 있어요…' : error}
    {!pending && error && <button type="button" onClick={() => void syncBungeoppangTime()}>시간 다시 확인</button>}
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
        if (!event.repeat) deliverBungeoppangOrder();
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
  const t = clock.t;
  const warn = phase === "play" && t >= R.rushWarnFromMs && t < R.rushFromMs;
  const rush = phase !== "countdown" && t >= R.rushFromMs;
  const left = Math.max(0, (R.durationMs - t) / 1000);
  return (
    <>
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
          손님이 몰려와요! {Math.ceil((R.rushFromMs - t) / 1000)}
        </div>
      )}
      {rush && t < R.rushFromMs + 1800 && (
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
  if (!slots) return null;
  return (
    <>
      {slots.map((slot, i) => {
        const heat = heatLook(slot.heat, clock.t, rules);
        const [label, ok] = actionLabel(slot, tool);
        const showLabel =
          phase === "play" && !confirmExit && (hover === i || (firstGame && i === 0 && slot.phase === 'empty'));
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

function Steps() {
  const v4 = useBungeoppang(s => s.status?.rulesVersion === 'v4');
  return (
    <ol className="bung-steps">
      <li>
        반죽 <kbd>Space</kbd>
      </li>
      <li>
        {v4 ? '소 선택' : '팥'} <kbd>{v4 ? '1~4' : '1'}</kbd>
      </li>
      <li>뒤집기</li>
      <li>{v4 ? '쟁반 → R 전달' : '꺼내기'}</li>
    </ol>
  );
}
function StartPanel() {
  const status = useBungeoppang((s) => s.status);
  const statusError = useBungeoppang((s) => s.statusError);
  const starting = useBungeoppang((s) => s.starting);
  const startError = useBungeoppang((s) => s.startError);
  const walletError = useBungeoppang((s) => s.walletError);
  const capped = !!status && status.todayEarned >= status.dailyCap;
  return (
    <section className="bung-panel bung-start" aria-label="붕어빵 굽기 시작">
      <h2>붕어빵 굽기</h2>
      <Steps />
      {status?.rulesVersion === 'v4' && <p>빵마다 랜덤 불! 주문은 한 손님 최대 4개 · 쟁반 4자리 · 60초 동안 전달해요.</p>}
      <p className="bung-keys-line">
        칸은 클릭 또는 Q W E A S D · 재료는 휠로도 바꿔요
      </p>
      <p>
        오늘 번 엽전 <b>{status ? status.todayEarned : "…"}</b> /{" "}
        {R.dailyCoinCap}냥
      </p>
      {capped && (
        <p className="bung-cap">오늘 장사는 끝! 게임은 계속할 수 있어요</p>
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
        <span>서버가 발급한 불 세기로 굽고, 기록 검증 후 엽전을 받아요.</span>
        <button type="button" className="bung-link" onClick={leaveBungeoppang}>
          ESC 나가기
        </button>
      </footer>
    </section>
  );
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
  const error = useBungeoppang(s => s.abandonError);
  if (!open) return null;
  return (
    <div className="bung-dim">
      <section
        className="bung-panel bung-confirm"
        role="alertdialog"
        aria-label="그만두기 확인"
      >
        <h2>그만둘까요?</h2>
        <p>{phase === 'result' ? '정산 결과를 아직 확인하지 못했어요. 나가면 이 화면의 재시도 기록을 잃습니다.' : '그만두면 이번 판은 포기 처리돼요. 타이머는 계속 흘러요.'}</p>
        {error && <p role="alert" className="bung-error">{error}</p>}
        <div className="bung-row">
          <button type="button" disabled={pending} onClick={() => void quitBungeoppang()}>
            {pending ? '포기 확인 중…' : '그만두기'}
          </button>
          <button
            type="button"
            className="bung-primary"
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

function ResultPanel() {
  const grill = useBungeoppang((s) => s.grill);
  const result = useBungeoppang((s) => s.result);
  const submitting = useBungeoppang((s) => s.submitting);
  const submitError = useBungeoppang((s) => s.submitError);
  const status = useBungeoppang((s) => s.status);
  const starting = useBungeoppang((s) => s.starting);
  const startError = useBungeoppang((s) => s.startError);
  const walletError = useBungeoppang(s => s.walletError);
  if (!grill) return null;
  const summary = result ?? grill;
  const items: [string, number | string][] = [
    ["만든 개수", summary.made],
    ["양면 황금", summary.golden],
    ["0점", summary.failed],
    ["버린 개수", summary.wasted],
    ["최고 콤보", summary.maxCombo],
    ["엽전 환산", `${R.pointsPerCoin}점당 1냥`],
  ];
  const today = result?.todayEarned ?? status?.todayEarned;
  const v4 = isV4Grill(grill);
  // 개발 미리보기는 서버 정산이 없으므로 확정·지급 문구 대신 환산 예상만 보여준다.
  const preview = v4 && bungeoppangV4Preview;
  return (
    <div className="bung-dim">
      <section className="bung-panel bung-result" aria-label="결과">
        <header>
          <h2>오늘의 장사</h2>
          <span>
            {preview ? '승인된 납품 점수' : result ? '서버 확정 점수' : v4 ? '승인 대기 납품 점수' : '미리보기 점수'} <b>{result?.score ?? grill.score}</b>
          </span>
        </header>
        <div className="bung-grid">
          {items.map(([label, value]) => (
            <div key={label}>
              <small>{label}</small>
              <b>{value}</b>
            </div>
          ))}
          {isV4Grill(grill) && <>
            <div><small>전달한 개수</small><b>{result?.served ?? grill.served}</b></div>
            <div><small>완료한 주문</small><b>{result?.customersServed ?? grill.customersServed}</b></div>
            <div><small>특수 추가 점수</small><b>{result?.bonusScore ?? grill.bonusScore}</b></div>
          </>}
        </div>
        <div className="bung-coins">
          <span>
            {preview ? '미리보기 · 환산 예상' : result ? '받은 엽전' : v4 ? '환산 예상' : '받은 엽전'}{" "}
            <b>
              {result
                ? `${preview ? result.coinsCalculated : result.coinsGranted}냥`
                : submitError
                  ? "-"
                  : "정산 중…"}
            </b>
          </span>
          <span>
            오늘 번 엽전 <b>{today ?? "…"}</b> / {R.dailyCoinCap}냥
          </span>
        </div>
        {result?.capReached && (
          <p className="bung-cap">오늘 장사는 끝! 게임은 계속할 수 있어요</p>
        )}
        {!preview && result && result.coinsGranted < result.coinsCalculated && (
          <p className="bung-cap">환산 {result.coinsCalculated}냥 중 오늘 한도를 적용해 {result.coinsGranted}냥을 받았어요.</p>
        )}
        {submitError && (
          <p className="bung-error" role="alert">
            {submitError.message}{" "}
            {submitError.retryable && !submitting && (
              <button
                type="button"
                className="bung-link"
                onClick={() => void submitBungeoppang()}
              >
                다시 시도
              </button>
            )}
          </p>
        )}
        {startError && <p className="bung-error">{startError}</p>}
        {walletError && <p className="bung-error" aria-live="polite">{walletError} <button onClick={() => void refreshBungeoppangWallet()}>잔액 다시 확인</button></p>}
        <footer>
          <span>{preview ? '미리보기 · 실제 엽전 지급 없음' : result ? '서버 정산 완료' : '서버 결과 확인 중'}</span>
          <span className="bung-row">
            <button type="button" onClick={escapeBungeoppang}>
              나가기
            </button>
            <button
              type="button"
              className="bung-primary"
              disabled={starting || submitting || (!result && submitError?.retryable !== false)}
              onClick={(e) => {
                e.currentTarget.blur();
                void startBungeoppang();
              }}
            >
              {starting ? "준비 중…" : "다시 하기"}
            </button>
          </span>
        </footer>
      </section>
    </div>
  );
}
