import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { estimatedServerTime, useSession } from '../../network/worldClient'
import { parkRuntime } from '../../park/runtime/runtime'
import { clearRoamingInput, inputState, panelOwnsKeys } from '../../world/inputOwnership'
import { emoteSlots as slots, emoteSector as sector, type Emote } from './catalog'
import { emoteUnavailable } from './availability'
import { useEmoteState } from './state'
import { noteTourAction } from '../welcomeTour/state'
import './emotes.css'
import emoteIcon from '../parkMenus/icons/dock-emote.svg'

const available = (choice: Emote) => !emoteUnavailable(choice.id)
type Wheel = { x: number; y: number; selected: number; mode: "hold" | "click"; scale: number };
const radius = 200;
function wedge(index: number) {
  const a = (index * Math.PI) / 4 - Math.PI / 8 + 0.022;
  const b = a + Math.PI / 4 - 0.044;
  const point = (r: number, angle: number) =>
    `${radius + Math.sin(angle) * r},${radius - Math.cos(angle) * r}`;
  return `M${point(184, a)} A184,184 0 0 1 ${point(184, b)} L${point(83, b)} A83,83 0 0 0 ${point(83, a)} Z`;
}
function Icon({ kind }: { kind: Emote["icon"] }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {kind === "wave" ? (
          <>
            <path d="M10 26 5 17c-1-2 1-3 2-1l3 4V8c0-3 3-3 3 0v7V5c0-3 3-3 3 0v10V7c0-3 3-3 3 0v9v-5c0-3 3-3 3 0v10c0 8-8 11-12 5Z" />
            <path d="M25 5c3 2 4 5 4 8M4 4 2 8" />
          </>
        ) : kind === "clap" ? (
          <>
            <path d="m12 21-5-9c-1-2 1-3 2-1l4 5-4-9c-1-2 2-3 3-1l5 9-3-9c-.6-2 2-3 3-1l4 10-1-6c-.4-2 2-3 3 0l3 12c1 6-5 10-10 7l-8-6c-2-1-1-4 1-3l3 2Z" />
            <path d="m5 5-2-2m21 0 1-2M29 8l2-1" />
          </>
        ) : kind === "tsk" ? (
          <>
            <circle cx="16" cy="16" r="12" />
            <path d="m8 11 5 2m11-2-5 2m-7 11c2-3 6-3 8 0M11 16v1m10-1v1" />
          </>
        ) : (
          <>
            <path d="M8 23a5 5 0 0 1-1-10 7 7 0 0 1 13-3 5 5 0 1 1 5 9 4 4 0 0 1-7 4H8Z" />
            <path d="m6 27-2 2m10-3-1 4m-11-9 3-1" />
          </>
        )}
      </g>
    </svg>
  );
}

export function EmoteWheel() {
  const status = useSession((s) => s.status);
  const readyAt = useEmoteState((s) => s.readyAt);
  const emoteError = useEmoteState((s) => s.error);
  const notice = useEmoteState(s => s.notice);
  const pending = useEmoteState(s => s.pending);
  const mapCompatible = useSession(s => s.mapCompatible);
  const tablePanel = useSession(s => !!s.focusedAnchorId);

  const [, refreshCooldown] = useState(0);
  useEffect(() => {
    const remaining = readyAt - estimatedServerTime();
    if (remaining <= 0) return;
    const timer = setTimeout(
      () => refreshCooldown((n) => n + 1),
      remaining + 50,
    );
    return () => clearTimeout(timer);
  }, [readyAt]);
  const [view, setView] = useState<Wheel | null>(null);
  const current = useRef<Wheel | null>(null);
  const lastPointer = useRef<{ x: number; y: number } | null>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const centerButton = useRef<HTMLButtonElement>(null);
  const pointerPressed = useRef(false);
  function update(next: Wheel | null) {
    current.current = next;
    setView(next);
  }
  function close(commit = false) {
    const previous = current.current;
    if (!previous) return;
    const choice = slots[previous.selected];
    update(null);
    inputState.emoteWheelOpen = false;
    pointerPressed.current = false;
    clearRoamingInput();
    if (dialog.current?.contains(document.activeElement))
      document.querySelector<HTMLCanvasElement>("canvas")?.focus({ preventScroll: true });
    if (
      commit &&
      choice &&
      available(choice) &&
      useSession.getState().status === "connected" &&
      !inputState.chatOpen &&
      !inputState.manualOpen &&
      !document.hidden
    )
      void parkRuntime.sendEmote(choice.id).then((sent) => { if (sent) noteTourAction("emote"); });
  }
  function open(mode: Wheel["mode"]) {
    if (
      current.current ||
      useSession.getState().status !== "connected" ||
      inputState.blocked ||
      inputState.manualOpen ||
      inputState.chatOpen || inputState.mapOpen || inputState.minigameOpen ||
      !useSession.getState().mapCompatible || !!useSession.getState().focusedAnchorId || document.hidden || panelOwnsKeys()
    )
      return;
    const pointer = mode === "hold" ? lastPointer.current : null;
    const scale = Math.min(0.8, (innerWidth - 24) / 448, (innerHeight - 80) / 448);
    const margin = (radius + 24) * scale;
    const x = Math.max(
      margin,
      Math.min(innerWidth - margin, pointer?.x ?? innerWidth / 2),
    );
    const y = Math.max(
      margin,
      Math.min(innerHeight - margin, pointer?.y ?? innerHeight / 2),
    );
    inputState.emoteWheelOpen = true;
    clearRoamingInput();
    update({ x, y, selected: -1, mode, scale });
  }
  function select(index: number) {
    const active = current.current;
    if (active && active.selected !== index)
      update({ ...active, selected: index });
  }
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      // F1 belongs to the global manual, even while the wheel has focus.
      if (inputState.manualOpen || event.code === "F1") return;
      const active = current.current;
      if (active) {
        event.stopImmediatePropagation();
        if (event.code === "Escape") {
          event.preventDefault();
          close();
        } else if (event.code === "Enter" || event.code === "Space") {
          event.preventDefault();
          if (!event.repeat) close(true);
        } else if (event.code === "Tab") {
          event.preventDefault();
          const buttons = [
            ...(dialog.current?.querySelectorAll<HTMLButtonElement>(
              "button:not(:disabled)",
            ) ?? []),
          ];
          const index = buttons.indexOf(
            document.activeElement as HTMLButtonElement,
          );
          buttons[
            (index + (event.shiftKey ? buttons.length - 1 : 1)) % buttons.length
          ]?.focus();
        } else if (
          ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
            event.code,
          )
        ) {
          event.preventDefault();
          const options = slots.flatMap((s, i) =>
            s && available(s) ? [i] : [],
          );
          if (!options.length) return;
          const direction = ["ArrowLeft", "ArrowUp"].includes(event.code)
            ? -1
            : 1;
          const index = options.indexOf(active.selected);
          select(
            options[index < 0 ? (direction > 0 ? 0 : options.length - 1) : (index + direction + options.length) % options.length]!,
          );
        } else if (
          ["KeyW", "KeyA", "KeyS", "KeyD", "KeyE", "KeyG"].includes(event.code)
        )
          event.preventDefault();
        return;
      }
      const target = event.target;
      if (
        event.code !== "KeyG" ||
        event.repeat ||
        event.isComposing ||
        event.keyCode === 229 ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        (target instanceof HTMLElement &&
          (target.isContentEditable ||
            ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName)))
      )
        return;
      event.preventDefault();
      open("hold");
    };
    const keyup = (event: KeyboardEvent) => {
      if (event.code === "KeyG" && current.current?.mode === "hold") {
        event.preventDefault();
        event.stopImmediatePropagation();
        close(true);
      }
    };
    const move = (event: PointerEvent) => {
      lastPointer.current = { x: event.clientX, y: event.clientY };
      if (current.current)
        select(
          sector(
            (event.clientX - current.current.x) / current.current.scale,
            (event.clientY - current.current.y) / current.current.scale,
          ),
        );
    };
    const cancel = () => close();
    const focus = (event: FocusEvent) => {
      if (current.current && !dialog.current?.contains(event.target as Node))
        close();
    };
    const visibility = () => {
      if (document.hidden) close();
    };
    window.addEventListener("keydown", keydown, true);
    window.addEventListener("keyup", keyup, true);
    window.addEventListener("pointermove", move, true);
    window.addEventListener("blur", cancel);
    window.addEventListener("ontop-browser-interrupt", cancel);
    window.addEventListener("ontop-manual-open", cancel);
    window.addEventListener("resize", cancel);
    document.addEventListener("visibilitychange", visibility);
    document.addEventListener("focusin", focus);
    return () => {
      close();
      window.removeEventListener("keydown", keydown, true);
      window.removeEventListener("keyup", keyup, true);
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("ontop-browser-interrupt", cancel);
      window.removeEventListener("ontop-manual-open", cancel);
      window.removeEventListener("resize", cancel);
      document.removeEventListener("visibilitychange", visibility);
      document.removeEventListener("focusin", focus);
    };
  }, []);
  useEffect(() => {
    if (status !== "connected" || !mapCompatible || tablePanel) close();
  }, [status, mapCompatible, tablePanel]);
  const isOpen = !!view;
  useEffect(() => {
    if (!isOpen) return;
    const timer = setInterval(() => {
      refreshCooldown(n => n + 1);
      if (inputState.chatOpen || inputState.manualOpen || inputState.mapOpen || inputState.minigameOpen || inputState.blocked) close();
    }, 100);
    return () => clearInterval(timer);
  }, [isOpen]);
  useEffect(() => {
    if (isOpen) centerButton.current?.focus({ preventScroll: true });
  }, [isOpen]);
  const selected = view ? slots[view.selected] : null;
  return (
    <>
      <div className="emotes" aria-label="모션" hidden={tablePanel}>
        {emoteError && (
          <p className="emote-feedback" role="alert">
            {emoteError}
          </p>
        )}
        {(notice || pending) && <p className="emote-feedback" role="status">{pending ? "감정표현 응답을 기다리고 있어요…" : notice}</p>}
        <button
          className="emote-wheel-trigger park-quick-button"
          aria-label="감정표현 열기"
          aria-keyshortcuts="G"
          title="감정표현 · G 키를 누른 채 선택"
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          disabled={status !== "connected" || !mapCompatible}
          onClick={(event) => {
            event.currentTarget.blur();
            open("click");
          }}
        >
          <img src={emoteIcon} alt="" />
          <span>감정표현</span>
          <kbd>G</kbd>
        </button>
      </div>
      {view && (
        <div
          className="emote-wheel-overlay"
          onContextMenu={(event) => {
            event.preventDefault();
            close();
          }}
          onPointerDown={(event) => {
            if (event.button === 0) {
              pointerPressed.current = true;
              if (!(event.target as Element).closest("button")) event.preventDefault();
            }
          }}
          onPointerUp={(event) => {
            if (
              event.button === 0 &&
              current.current?.mode === "click" &&
              pointerPressed.current && !(event.target as Element).closest("button")
            )
              close(true);
            pointerPressed.current = false;
          }}
        >
          <div
            ref={dialog}
            className="emote-wheel"
            role="dialog"
            aria-modal="true"
            aria-label="감정표현 선택"
            aria-describedby="emote-wheel-help"
            style={{ left: view.x, top: view.y, transform: `translate(-50%, -50%) scale(${view.scale})` }}
          >
            <svg
              className="emote-wheel-sectors"
              viewBox="0 0 400 400"
              aria-hidden="true"
            >
              <circle
                cx="200"
                cy="200"
                r="192"
                className="emote-wheel-outline"
              />
              {slots.map((slot, i) => (
                <path
                  key={i}
                  d={wedge(i)}
                  className={`${slot ? "available" : "empty"} ${view.selected === i ? "active" : ""}`}
                />
              ))}
              <circle cx="200" cy="200" r="79" className="emote-wheel-core" />
            </svg>
            {slots.map((slot, i) => {
              const angle = (i * Math.PI) / 4;
              const style = {
                left: 200 + Math.sin(angle) * 133,
                top: 200 - Math.cos(angle) * 133,
                "--emote-color": slot?.color ?? "#73867b",
              } as CSSProperties;
              return slot ? (
                <button
                  key={i}
                  className={`emote-wheel-option ${view.selected === i ? "active" : ""}`}
                  style={style}
                  aria-label={slot.label}
                  disabled={!available(slot)}
                  onFocus={() => select(i)}
                  onClick={() => {
                    select(i);
                    if (current.current?.mode === "click") close(true);
                  }}
                >
                  <Icon kind={slot.icon} />
                  <span>{slot.label}</span>
                </button>
              ) : (
                <span
                  key={i}
                  className="emote-wheel-empty"
                  style={style}
                  aria-label={`빈 감정표현 칸 ${i + 1}`}
                >
                  ＋
                </span>
              );
            })}
            <button
              ref={centerButton}
              className="emote-wheel-center"
              aria-label="감정표현 취소"
              onClick={() => close()}
              onFocus={() => select(-1)}
            >
              <span className="emote-wheel-kicker">EXPRESSION</span>
              <strong aria-live="polite">
                {selected?.label ??
                  (view.selected >= 0 ? "비어 있는 칸" : "감정표현")}
              </strong>
              <small>
                {selected
                  ? view.mode === "hold"
                    ? "G 키를 놓아 사용"
                    : "클릭하여 사용"
                  : "선택하지 않으면 취소"}
              </small>
            </button>
            <p id="emote-wheel-help" className="emote-wheel-help">
              {estimatedServerTime() < readyAt ? (
                "다음 감정표현까지 잠시 기다려 주세요"
              ) : selected && emoteUnavailable(selected.id) ? (
                emoteUnavailable(selected.id)
              ) : view.mode === 'click' ? (
                '표현을 클릭하거나 방향키·Enter로 선택 · Esc 취소'
              ) : (
                <>
                  <kbd>G</kbd> 누른 채 마우스 이동 <span>·</span> <kbd>Esc</kbd>{" "}
                  취소
                </>
              )}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
