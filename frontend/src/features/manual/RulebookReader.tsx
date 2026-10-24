import { useEffect, useRef, useState, type ReactNode } from "react";
import { useManual } from "./manualState";
import type { Rulebook, RulebookPage } from "./types";
import { CurrentIllustration } from "./CurrentIllustration";

function Illustration({
  page,
  onDetails,
  enlarged = false,
  zoom = 1,
  fit = true,
}: {
  page: RulebookPage;
  onDetails: () => void;
  enlarged?: boolean;
  zoom?: number;
  fit?: boolean;
}) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const image = useRef<HTMLImageElement>(null);
  useEffect(() => {
    // An already-cached image may have completed before React attaches onLoad.
    if (image.current?.complete)
      setStatus(image.current.naturalWidth ? "ready" : "error");
  }, []);
  if (page.src.startsWith('guide:')) return <div className="rulebook-illustration" style={enlarged ? { width: `${zoom * 100}%` } : undefined}>
    <CurrentIllustration kind={page.src === 'guide:renju' ? 'renju' : 'farkle'} />
  </div>;
  return (
    <div className={`rulebook-illustration${enlarged ? " is-enlarged" : ""}`}>
      {status === "loading" && <p role="status">그림을 불러오는 중이에요…</p>}
      {status === "error" ? (
        <div className="rulebook-image-error" role="status">
          <b>그림을 불러오지 못했어요.</b>
          <p>같은 내용을 상세 규칙에서 바로 읽을 수 있어요.</p>
          <button onClick={onDetails}>상세 규칙 읽기</button>
        </div>
      ) : (
        <img
          ref={image}
          src={page.src}
          alt={page.alt}
          decoding="async"
          width={1672}
          height={941}
          style={
            enlarged
              ? {
                  width: `${zoom * 100}%`,
                  height: fit ? "100%" : "auto",
                  objectFit: "contain",
                }
              : undefined
          }
          onLoad={() => setStatus("ready")}
          onError={() => setStatus("error")}
        />
      )}
    </div>
  );
}

export function RulebookReader({
  title,
  book,
  children,
}: {
  title: string;
  book: Rulebook;
  children: ReactNode;
}) {
  const [mode, setMode] = useState<"pictures" | "details">("pictures");
  const [index, setIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [fit, setFit] = useState(true);
  const manualOpen = useManual((state) => state.open && state.phase !== 'closing');
  const lightbox = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const zoomScroll = useRef<HTMLDivElement>(null);
  const page = book.pages[index];

  function choose(next: number) {
    setIndex(Math.max(0, Math.min(book.pages.length - 1, next)));
    setZoom(1);
    setFit(true);
    zoomScroll.current?.scrollTo({ top: 0, left: 0 });
  }
  function showDetails() {
    setExpanded(false);
    setMode("details");
  }
  useEffect(() => {
    const dialog = lightbox.current;
    if (expanded && manualOpen) {
      if (!dialog?.open) dialog?.showModal();
      closeButton.current?.focus();
    } else {
      dialog?.close();
      if (!manualOpen) setExpanded(false);
    }
  }, [expanded, manualOpen]);

  function pager() {
    return (
      <div className="rulebook-pager" role="group" aria-label="그림 페이지">
        <button
          disabled={index === 0}
          onClick={() => choose(index - 1)}
          aria-label="이전 그림"
        >
          ←
        </button>
        <span aria-live="polite">
          {index + 1} / {book.pages.length}
        </span>
        <button
          disabled={index === book.pages.length - 1}
          onClick={() => choose(index + 1)}
          aria-label="다음 그림"
        >
          →
        </button>
      </div>
    );
  }
  return (
    <div className="rulebook-reader">
      <div className="rulebook-mode" role="group" aria-label="설명 보기 방식">
        <button
          aria-pressed={mode === "pictures"}
          onClick={() => setMode("pictures")}
        >
          그림으로 보기
        </button>
        <button
          aria-pressed={mode === "details"}
          onClick={() => setMode("details")}
        >
          상세 규칙
        </button>
      </div>
      {mode === "pictures" ? (
        <section aria-label={`${title} 그림 설명`}>
          <div className="rulebook-page-heading">
            <div>
              <span className="manual-eyebrow">한 장씩, 쉽게 알아봐요</span>
              <h4>{page.title}</h4>
            </div>
            <button
              className="rulebook-expand"
              onClick={() => {
                setZoom(1);
                setFit(true);
                setExpanded(true);
              }}
            >
              그림 크게 보기 ↗
            </button>
          </div>
          <Illustration key={page.src} page={page} onDetails={showDetails} />
          <div className="rulebook-page-bottom">
            <p>작은 글씨는 ‘그림 크게 보기’에서 확대해 보세요.</p>
            {pager()}
          </div>
          {page.note && <p className="rulebook-note">{page.note}</p>}
          <button className="rulebook-detail-link" onClick={showDetails}>
            예외·제한시간까지 상세 규칙 읽기 →
          </button>
        </section>
      ) : (
        <section aria-label={`${title} 상세 규칙`}>
          <div className="rulebook-detail-intro">
            <p>그림에서 본 규칙과 자세한 예외를 차례대로 확인해요.</p>
            <a href={book.rulebookUrl} download={`${title}-상세규칙.md`}>
              규칙 파일 내려받기
            </a>
          </div>
          {children}
        </section>
      )}
      <dialog
        ref={lightbox}
        className="rulebook-lightbox"
        aria-label={`${title} 그림 확대`}
        aria-describedby="rulebook-zoom-help"
        onCancel={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setExpanded(false);
        }}
        onClose={() => setExpanded(false)}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Tab") {
            const items = [
              ...event.currentTarget.querySelectorAll<HTMLElement>(
                'button:not(:disabled), [tabindex="0"]',
              ),
            ].filter((element) => element.getClientRects().length > 0);
            const first = items[0],
              last = items.at(-1);
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first?.focus();
            }
            return;
          }
          if (event.altKey || event.ctrlKey || event.metaKey) return;
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            // When zoomed, arrows keep their native scrolling behavior.
            if (!fit) return;
            event.preventDefault();
            choose(index + (event.key === "ArrowRight" ? 1 : -1));
          }
        }}
      >
        <header className="rulebook-lightbox-header">
          <div>
            <span className="manual-eyebrow">{title}</span>
            <h3>{page.title}</h3>
          </div>
          <button ref={closeButton} onClick={() => setExpanded(false)}>
            확대 닫기 · Esc
          </button>
        </header>
        <div className="rulebook-zoom-toolbar">
          {pager()}
          <div role="group" aria-label="그림 확대 비율">
            <button
              aria-label="그림 축소"
              disabled={fit || zoom <= 0.5}
              onClick={() => {
                setFit(false);
                setZoom(Math.max(0.5, zoom - 0.5));
              }}
            >
              −
            </button>
            <output aria-live="polite">{Math.round(zoom * 100)}%</output>
            <button
              aria-label="그림 확대"
              disabled={zoom >= 3}
              onClick={() => {
                setFit(false);
                setZoom(Math.min(3, zoom + 0.5));
              }}
            >
              +
            </button>
            <button
              onClick={() => {
                setZoom(1);
                setFit(true);
              }}
            >
              화면 맞춤
            </button>
            <button
              onClick={() => {
                const image = zoomScroll.current?.querySelector("img");
                if (zoomScroll.current) {
                  setFit(false);
                  setZoom(Math.max(0.5, Math.min(3, (image?.naturalWidth || 1672) / zoomScroll.current.clientWidth)));
                }
              }}
            >
              원본 크기
            </button>
          </div>
        </div>
        <div
          className="rulebook-zoom-scroll"
          ref={zoomScroll}
          tabIndex={0}
          aria-label="확대 그림 스크롤"
        >
          {expanded && (
            <Illustration
              key={page.src}
              page={page}
              onDetails={showDetails}
              enlarged
              zoom={zoom}
              fit={fit}
            />
          )}
        </div>
        <footer className="rulebook-lightbox-footer">
          <p id="rulebook-zoom-help">
            {page.note ??
              "확대 후 스크롤로 살펴보세요. 화면 맞춤에서는 ← → 키로 페이지를 넘겨요."}
          </p>
          <strong>설명서를 읽는 동안에도 경기는 계속돼요.</strong>
        </footer>
      </dialog>
    </div>
  );
}
