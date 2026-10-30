import { useLayoutEffect, useRef, type RefObject } from 'react'
import { SUITS, SUIT_GLYPH, SUIT_NAME } from './presentation'
import type { Suit } from './protocol'

/** Keep keyboard users on the next action without taking focus from chat or a modal. */
export function OneCardSuitChoice({ enabled, choose, guidance }: {
  enabled: boolean; choose(suit: Suit): void; guidance: RefObject<HTMLDivElement | null>
}) {
  const group = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const active = document.activeElement
    if (!enabled || document.querySelector('dialog[open],[role="dialog"]')
      || active instanceof HTMLElement && active.closest('input,textarea,select,[contenteditable="true"]')) return
    group.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true })
  }, [enabled])
  useLayoutEffect(() => {
    const node = group.current
    return () => {
      if ((node?.contains(document.activeElement) || document.activeElement === document.body)
        && !document.querySelector('dialog[open],[role="dialog"]')) guidance.current?.focus({ preventScroll: true })
    }
  }, [guidance])
  return <div ref={group} className="onecard-actions onecard-suit-choice" role="group" aria-label="무늬 선택">
    {SUITS.map(suit => <button key={suit} disabled={!enabled} onClick={() => choose(suit)}>
      <b aria-hidden="true" data-red={suit === 'hearts' || suit === 'diamonds'}>{SUIT_GLYPH[suit]}</b>{SUIT_NAME[suit]} 선택
    </button>)}
  </div>
}
