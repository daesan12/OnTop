import { useId, useLayoutEffect, useRef, type CSSProperties, type PointerEvent } from 'react'
import type { Card } from './protocol'
import { CardFace } from './CardFace'
import { cardEffect, cardLabel, redCard } from './presentation'
import { CARD_DRAG_SLOP, cardDropReady } from './motion'

interface Props {
  card: Card; scope: string; index: number; angle: number; lift: number
  flipped: boolean; selected: boolean; playable: boolean
  canPlay(): boolean; select(): void; grab(): void; play(): void; restore(): void
  dragging(value: { id: string; ready: boolean } | null): void
}
interface Drag { id: number; x: number; y: number; dx: number; dy: number; height: number; active: boolean; ready: boolean }

/** Move the existing private DOM card, never a private texture in the shared 3D scene. */
export function HandCard({ card, scope, index, angle, lift, flipped, selected, playable, canPlay, select, grab, play, restore, dragging }: Props) {
  const button = useRef<HTMLButtonElement>(null), drag = useRef<Drag | null>(null), suppressClick = useRef(false)
  const hintId = useId(), effect = flipped ? '' : cardEffect(card)
  const cancel = () => {
    const node = button.current, previous = drag.current
    drag.current = null
    if (previous?.active) { suppressClick.current = true; dragging(null) }
    if (!node) return
    delete node.dataset.dragging; delete node.dataset.dropReady
    node.style.removeProperty('--drag-x'); node.style.removeProperty('--drag-y'); node.style.removeProperty('--drag-tilt')
    if (previous && node.hasPointerCapture(previous.id)) node.releasePointerCapture(previous.id)
  }
  // A new version, lost permission, prank, or unmount invalidates a gesture before it can submit.
  useLayoutEffect(() => { cancel() }, [scope, flipped, playable])
  useLayoutEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !drag.current) return
      event.preventDefault(); event.stopPropagation(); cancel()
    }
    const blur = () => cancel()
    window.addEventListener('keydown', key, true); window.addEventListener('blur', blur)
    return () => { window.removeEventListener('keydown', key, true); window.removeEventListener('blur', blur); cancel() }
  }, [])
  const start = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || !event.isPrimary || drag.current || flipped || !canPlay()) return
    suppressClick.current = false
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, dy: 0,
      height: event.currentTarget.offsetHeight, active: false, ready: false }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    const held = drag.current
    if (!held || held.id !== event.pointerId) return
    if (!canPlay()) { cancel(); return }
    held.dx = event.clientX - held.x; held.dy = event.clientY - held.y
    if (!held.active && Math.hypot(held.dx, held.dy) < CARD_DRAG_SLOP) return
    if (!held.active) { held.active = true; grab(); dragging({ id: card.id, ready: false }) }
    const node = event.currentTarget, ready = cardDropReady(held.dx, held.dy, held.height)
    node.dataset.dragging = 'true'; node.dataset.dropReady = String(ready)
    node.style.setProperty('--drag-x', `${held.dx}px`); node.style.setProperty('--drag-y', `${held.dy}px`)
    node.style.setProperty('--drag-tilt', `${Math.max(-15, Math.min(15, held.dx * .08))}deg`)
    if (held.ready !== ready) { held.ready = ready; dragging({ id: card.id, ready }) }
  }
  const release = (event: PointerEvent<HTMLButtonElement>) => {
    const held = drag.current
    if (!held || held.id !== event.pointerId) return
    // Re-evaluate the final pointer position and live permission, including an expired turn.
    const submit = held.active && cardDropReady(event.clientX - held.x, event.clientY - held.y, held.height) && canPlay()
    cancel()
    if (submit) play()
  }
  return <button ref={button} className={`onecard-card onecard-hand-card ${redCard(card) && !flipped ? 'red' : ''}`}
    style={{ '--fan-angle': `${angle}deg`, '--fan-lift': `${lift}px`, '--fan-index': index } as CSSProperties}
    data-card-id={card.id} data-flipped={flipped} data-playable={!flipped && playable} aria-pressed={!flipped && selected}
    aria-label={flipped ? '뒤집힌 카드 · 모든 손패 복구' : [cardLabel(card), cardEffect(card)].filter(Boolean).join(' · ')}
    aria-describedby={effect ? hintId : undefined}
    disabled={!flipped && !playable} onPointerDown={start} onPointerMove={move} onPointerUp={release}
    onPointerCancel={cancel} onLostPointerCapture={cancel} onDragStart={event => event.preventDefault()}
    onClick={event => {
      if (suppressClick.current && event.detail !== 0) { suppressClick.current = false; return }
      suppressClick.current = false
      if (flipped) restore(); else if (canPlay()) select()
    }}>
    <span className="onecard-card-rotator">
      <span className="onecard-card-front">{!flipped && <CardFace card={card} />}</span>
      <span className="onecard-card-back" aria-hidden="true"><span>✦</span></span>
    </span>
    {effect && <span id={hintId} role="tooltip" className="onecard-ability-tip">{effect}</span>}
  </button>
}
