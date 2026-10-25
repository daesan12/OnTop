import { useEffect, useState, type CSSProperties } from "react";
import { BUNGEOPPANG } from "./config";
import type { GrillSlot } from "./rules";
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
  type BungPopup,
} from "./store";
import "./bungeoppang.css";

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
      {playing && <SlotOverlays />}
      <Popups />
      <TipBubble />
      {phase === "start" && <StartPanel />}
      {phase === "countdown" && <Countdown />}
      {phase === "ending" && <div className="bung-big-text">끝!</div>}
      {phase === "result" && <ResultPanel />}
      <ExitConfirm />
      {phase !== 'leaving' && <button className="bung-help-button" onClick={() => setBungeoppangHelp(true)}>F1 조작 안내</button>}
    </div>
  );
}

function useMinigameInput(active: boolean) {
  useEffect(() => {
    if (!active) return;
    let wheelSum = 0,
      wheelLock = 0;
    const keydown = (event: KeyboardEvent) => {
      if (
        typing() ||
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
      if (event.code === "Digit1" || event.code === "Numpad1") {
        consume();
        setBungeoppangTool("bean");
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
        typing() ||
        document.querySelector('dialog[open], [role="dialog"]')
      )
        return;
      // 게임 중 휠은 카메라 줌·화면 스크롤 대신 재료 바꾸기다.
      event.preventDefault();
      if (useBungeoppang.getState().phase !== "play") return;
      const now = performance.now();
      if (now < wheelLock) return;
      wheelSum += event.deltaY;
      if (Math.abs(wheelSum) >= 40) {
        setBungeoppangTool(wheelSum > 0 ? "bean" : "batter");
        wheelSum = 0;
        wheelLock = now + 150;
      }
    };
    window.addEventListener("keydown", keydown, true);
    window.addEventListener("wheel", wheel, { capture: true, passive: false });
    return () => {
      window.removeEventListener("keydown", keydown, true);
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
        <button
          type="button"
          data-active={tool === "batter"}
          onClick={() => setBungeoppangTool("batter")}
          tabIndex={-1}
        >
          반죽 <kbd>Space</kbd>
        </button>
        <button
          type="button"
          data-active={tool === "bean"}
          onClick={() => setBungeoppangTool("bean")}
          tabIndex={-1}
        >
          팥 <kbd>1</kbd>
        </button>
        <span className="bung-tools-label">휠 위·아래로도 바꿔요</span>
      </div>
    </>
  );
}

function actionLabel(slot: GrillSlot, tool: "batter" | "bean") {
  if (slot.phase === "empty")
    return tool === "batter" ? ["반죽 붓기", true] : ["반죽부터", false];
  if (slot.phase === "batter")
    return tool === "bean" ? ["팥 넣기", true] : ["팥으로 바꾸기", false];
  return slot.phase === "front" ? ["뒤집기", true] : ["꺼내기 (뒷면)", true];
}
function SlotOverlays() {
  const slots = useBungeoppang((s) => s.grill?.slots);
  const tool = useBungeoppang((s) => s.tool);
  const hover = useBungeoppang((s) => s.hover);
  const firstGame = useBungeoppang((s) => s.firstGame);
  const phase = useBungeoppang((s) => s.phase);
  const confirmExit = useBungeoppang((s) => s.confirmExit);
  if (!slots) return null;
  return (
    <>
      {slots.map((slot, i) => {
        const [label, ok] = actionLabel(slot, tool);
        const showLabel =
          phase === "play" && !confirmExit && (hover === i || firstGame);
        return (
          <div
            key={i}
            className="bung-slot"
            ref={(el) => {
              slotOverlayEls[i] = el;
            }}
          >
            <span className="bung-slot-key">{R.slotKeys[i]}</span>
            {showLabel && (
              <span className="bung-slot-label" data-ok={ok}>
                {label}
              </span>
            )}
            <span className="bung-steam" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span className="bung-gauge" aria-hidden="true">
              <span className="bung-gauge-fill" />
            </span>
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
          left: slotScreen[tip.slot]!.x,
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
  return (
    <ol className="bung-steps">
      <li>
        반죽 <kbd>Space</kbd>
      </li>
      <li>
        팥 <kbd>1</kbd>
      </li>
      <li>뒤집기</li>
      <li>꺼내기</li>
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
  const text = c > 2500 ? "3" : c > 1500 ? "2" : c > 500 ? "1" : "시작!";
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
  return (
    <div className="bung-dim">
      <section className="bung-panel bung-result" aria-label="결과">
        <header>
          <h2>오늘의 장사</h2>
          <span>
            {result ? '서버 확정 점수' : '미리보기 점수'} <b>{result?.score ?? grill.score}</b>
          </span>
        </header>
        <div className="bung-grid">
          {items.map(([label, value]) => (
            <div key={label}>
              <small>{label}</small>
              <b>{value}</b>
            </div>
          ))}
        </div>
        <div className="bung-coins">
          <span>
            받은 엽전{" "}
            <b>
              {result
                ? `${result.coinsGranted}냥`
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
          <span>{result ? '서버 정산 완료' : '서버 결과 확인 중'}</span>
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
