import type { CSSProperties } from 'react'
import type { BangCard as Card } from './protocol'
import { CARD_DESCRIPTION, CARD_NAME, cardCategory, cardRank } from './presentation'
import { CardHelp } from './CardHelp'

export const ART_INDEX = { BANG: 0, MISSED: 1, BEER: 2, SALOON: 3, DUEL: 4, INDIANS: 5, GATLING: 6, STAGECOACH: 7, WELLS_FARGO: 8, GENERAL_STORE: 9, PANIC: 10, CAT_BALOU: 11, BARREL: 12, JAIL: 13, DYNAMITE: 14, MUSTANG: 15, SCOPE: 16, VOLCANIC: 17, SCHOFIELD: 18, REMINGTON: 19, REV_CARABINE: 20, WINCHESTER: 21 }
export function artStyle(index: number): CSSProperties {
  return { backgroundImage: 'url(/art/bang/card-atlas.webp)', backgroundSize: '600% 400%', backgroundPosition: `${index % 6 / 5 * 100}% ${Math.floor(index / 6) / 3 * 100}%` }
}
export function BangCard({ card, selected = false, disabled = false, onSelect, compact = false, onInspect }: {
  card: Card; selected?: boolean; disabled?: boolean; onSelect?: () => void; compact?: boolean; onInspect?(card: Card): void
}) {
  const description = `${CARD_NAME[card.kind]} · ${cardRank(card)} · ${CARD_DESCRIPTION[card.kind]}`
  const content = <><strong>{CARD_NAME[card.kind]}</strong><span className="bang-card-illustration" aria-hidden="true" style={artStyle(ART_INDEX[card.kind])} />
    <span className="bang-card-rank" data-red={card.suit === 'HEARTS' || card.suit === 'DIAMONDS'}>{cardRank(card)}</span>
    <span className="bang-card-category">{cardCategory(card.kind)} 카드</span>
    {!compact && <small>{CARD_DESCRIPTION[card.kind]}</small>}</>
  return <CardHelp card={card} focusable={!onSelect} onInspect={onInspect}>{onSelect
    ? <button type="button" className="bang-card" data-compact={compact} data-kind={card.kind} aria-label={description} aria-pressed={selected}
      aria-disabled={disabled} onClick={() => { onInspect?.(card); if (!disabled) onSelect() }}>{content}</button>
    : <div className="bang-card" data-compact={compact} role="img" aria-label={description}>{content}</div>}
  </CardHelp>
}
