import {
  Component,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSession } from "../../network/worldClient";
import { useGame } from "../../game/store";
import { gameState } from "../../game/protocol";
import { useBungeoppang } from "../bungeoppang/store";
import { useJumpmap } from "../jumpmap/state";
import { BookIcon } from "./GameArt";
import {
  closeManual,
  openManual,
  useManual,
  finishManualOpening,
  finishManualClosing,
  MANUAL_OPEN_MS,
  MANUAL_CLOSE_MS,
  MANUAL_REDUCED_MS,
  resetManual,
  takeWelcomeManual,
} from "./manualState";
import type { ManualGameId } from "./types";
import { OnDemandContent } from "../../park/OnDemandContent";
import { NewspaperCover } from "./NewspaperCover";
import "./manual.css";

const loadContents = () => import("./ManualContents");

// Keep F1, the modal shell and input ownership available while the guide loads.
class ReadingBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="manual-loading" role="alert">
        <p>설명서를 표시하지 못했어요. 게임을 나가지 않고 다시 열 수 있어요.</p>
        <button
          onClick={() => {
            useManual.setState({ page: "catalog" });
            this.setState({ failed: false });
          }}
        >
          설명서 다시 열기
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}

function openContextManual() {
  const session = useSession.getState();
  const game = useGame.getState().game;
  const code = game ? gameState(game).gameCode : session.tableStates[session.tableId || session.watchedTableId]?.gameCode;
  const pages: Record<string, ManualGameId> = { OMOK:"gomoku", DICE:"farkle", ONE_CARD:"onecard", LIAR_BRIDGE:"bridge" };
  openManual(useBungeoppang.getState().phase !== "idle" ? "fish-bread" : session.telescopeId ? "places" : pages[code ?? ""] ?? (useJumpmap.getState().run ? "jump" : undefined));

}

export function ManualHost({
  showLauncher = true,
  worldActions,
}: {
  showLauncher?: boolean;
  worldActions?: ReactNode;
}) {
  useEffect(() => {
    const unsubscribe = useSession.subscribe((s, old) => {
      if (s.status !== "connected" || s.sessionId !== old.sessionId || s.roomId !== old.roomId) resetManual();
      if (s.status === "connected" && s.roomId && takeWelcomeManual()) openManual("welcome");
    });
    return () => { unsubscribe(); resetManual(); };
  }, []);
  const open = useManual((s) => s.open);
  const phase = useManual((s) => s.phase);
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const dialog = useRef<HTMLDialogElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (phase !== "opening" && phase !== "closing") return;
    const timer = window.setTimeout(
      phase === "opening" ? finishManualOpening : finishManualClosing,
      reducedMotion
        ? MANUAL_REDUCED_MS
        : phase === "opening"
          ? MANUAL_OPEN_MS
          : MANUAL_CLOSE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [phase, reducedMotion]);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (document.pointerLockElement) document.exitPointerLock();
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);
  useLayoutEffect(() => {
    if (phase === "open") closeButton.current?.focus({ preventScroll: true });
    else if (open) dialog.current?.focus({ preventScroll: true });
  }, [phase, open]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.code !== "F1" || event.isComposing || event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (["opening", "closing"].includes(useManual.getState().phase)) return;
      if (useManual.getState().open) closeManual();
      else openContextManual();
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, []);
  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      restoreFocus.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      element.showModal();
    } else if (!open && element.open) {
      element.close();
      const previous = restoreFocus.current;
      if (previous?.isConnected && previous !== document.body)
        previous.focus({ preventScroll: true });
      else {
        // F1 opened from the world returns to game input, not a focused toolbar button.
        const canvas =
          document.querySelector<HTMLCanvasElement>("canvas");
        (canvas ?? launcher.current)?.focus({ preventScroll: true });
      }
    }
  }, [open]);
  return (
    <>
      {showLauncher && (
        <button
          ref={launcher}
          className="manual-launcher"
          aria-haspopup="dialog"
          aria-keyshortcuts="F1"
          onClick={openContextManual}
        >
          <BookIcon />
          <span><span className="visually-hidden">게임 </span>설명서</span>
          <kbd>F1</kbd>
        </button>
      )}
      <dialog
        ref={dialog}
        className="game-manual"
        data-phase={phase}
        tabIndex={-1}
        aria-label="게임 설명서"
        aria-describedby="manual-pause-note"
        onCancel={(event) => {
          event.preventDefault();
          closeManual();
        }}
        onClose={() => {
          if (!dialog.current?.open && useManual.getState().open) {
            closeManual();
            finishManualClosing();
          }
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
          // The enlarged illustration is its own native modal dialog.
          if (
            event.target instanceof Element &&
            event.target.closest("dialog") !== event.currentTarget
          )
            return;
          if (event.key !== "Tab") return;
          if (phase !== "open") {
            event.preventDefault();
            return;
          }
          const items = [
            ...event.currentTarget.querySelectorAll<HTMLElement>(
              'button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]',
            ),
          ].filter((element) => element.getClientRects().length > 0);
          const first = items[0],
            last = items[items.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
      >
        <div className="manual-paper" aria-hidden="true" />
        {/* The folded left page swings open over the crease, then hands off to the real sheet. */}
        <div className="manual-fold" aria-hidden="true">
          <div className="manual-fold-face manual-fold-inside" />
          <div className="manual-fold-face manual-fold-cover">
            <NewspaperCover />
          </div>
        </div>
        <div className="manual-sheet-content" inert={phase !== "open"}>
          <header className="manual-header">
            {/* The channel line shares the issue column, so no separate strip sits above the contents. */}
            <div className="manual-issue-column">
              <p className="manual-issue">제 1호 · 공원 안내 특집</p>
              {worldActions}
            </div>
            <h2 className="manual-masthead">
              <span className="manual-seal" aria-hidden="true">탑</span>
              OnTop
            </h2>
            <p className="manual-tagline">처음이어도 괜찮아요. 한 장씩 알아봐요.</p>
            <button
              ref={closeButton}
              className="manual-close"
              aria-label="설명서 닫기"
              onClick={closeManual}
            >
              <span aria-hidden="true">×</span>
              <kbd>Esc</kbd>
            </button>
          </header>
          <ReadingBoundary>
            <OnDemandContent active={open} load={loadContents} label="설명서" onClose={closeManual} className="manual-loading">
              <p>WASD 이동 · Shift 달리기 · Space 점프 · E 상호작용 · Enter 채팅 · F1 설명서</p>
              <p>Esc 또는 설명서 닫기로 공원에 돌아갈 수 있어요. 경기는 계속 진행돼요.</p>
            </OnDemandContent>
          </ReadingBoundary>
          <footer className="manual-footer" id="manual-pause-note">
            <span aria-hidden="true">!</span>
            <p>
              설명서를 읽는 동안에도 경기는 계속돼요.{" "}
              <strong>제한시간은 멈추지 않아요.</strong>
            </p>
            <small>공원 · 대기 · 플레이 · 관전</small>
          </footer>
        </div>
      </dialog>
    </>
  );
}
