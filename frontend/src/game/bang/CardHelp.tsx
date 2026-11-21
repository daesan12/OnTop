import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { BangCard } from './protocol'
import { CARD_DESCRIPTION, CARD_NAME, CARD_RULE, cardCategory, cardRank } from './presentation'

/** 스크롤 영역 밖에 표시해 손패의 설명이 잘리지 않게 한다. 비활성 카드도 읽을 수 있다. */
export function CardHelp({ card, children, focusable = false, onInspect }: {
  card: BangCard; children: ReactNode; focusable?: boolean; onInspect?(card: BangCard): void
}) {
  const id = useId(), anchor = useRef<HTMLSpanElement>(null)
  const tooltip = useRef<HTMLElement>(null)
  const [position, setPosition] = useState<{ left: number; top: number; above: boolean } | null>(null)
  const open = position !== null
  useLayoutEffect(() => {
    const box = tooltip.current?.getBoundingClientRect()
    if (!position || !box) return
    if (box.top < 11.5 || box.bottom > window.innerHeight - 11.5) {
      setPosition({ ...position, above: false, top: Math.max(12, Math.min(box.top, window.innerHeight - box.height - 12)) })
    }
  }, [position])
  useEffect(() => {
    if (!open) return
    const close = () => setPosition(null)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => { window.removeEventListener('resize', close); window.removeEventListener('scroll', close, true) }
  }, [open])
  const show = () => {
    const rect = anchor.current?.getBoundingClientRect()
    if (!rect) return
    const width = Math.min(320, window.innerWidth - 24)
    setPosition({ left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)), above: rect.top > 310,
      top: rect.top > 310 ? rect.top - 12 : Math.min(rect.bottom + 12, window.innerHeight - 280) })
    onInspect?.(card)
  }
  return <span ref={anchor} className="bang-card-target" tabIndex={focusable ? 0 : undefined}
    aria-label={focusable ? `${CARD_NAME[card.kind]} · ${CARD_DESCRIPTION[card.kind]}` : undefined}
    aria-describedby={position ? id : undefined}
    onMouseEnter={show} onMouseLeave={() => { if (!anchor.current?.contains(document.activeElement)) setPosition(null) }}
    onFocus={show} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setPosition(null) }}
    onPointerDown={event => { if (event.pointerType === 'touch') show() }}
    onKeyDown={event => { if (event.key === 'Escape' && position) { event.stopPropagation(); setPosition(null) } }}>
    {children}
    {position && createPortal(<aside ref={tooltip} id={id} role="tooltip" className="bang-card-tooltip"
      style={{ left: position.left, top: position.top, transform: position.above ? 'translateY(-100%)' : undefined }}>
      <span>{cardCategory(card.kind)} 카드 · {cardRank(card)}</span><strong>{CARD_NAME[card.kind]}</strong>
      <p>{CARD_DESCRIPTION[card.kind]}</p><p>{CARD_RULE[card.kind]}</p><small>마우스를 옮기거나 Esc를 누르면 닫혀요</small>
    </aside>, anchor.current?.closest('dialog') ?? document.body)}
  </span>
}
