import { cardDescription, cardEffect, SUIT_GLYPH } from './presentation'
import type { Card } from './protocol'

export function CardFace({ card }: { card: Card }) {
  const rank = card.suit ? card.rank : 'JOKER', symbol = card.suit ? SUIT_GLYPH[card.suit] : '✦'
  const effect = cardEffect(card)
  return <><span className="onecard-corner"><span>{rank}</span><span>{symbol}</span></span>
    <strong className="onecard-symbol">{symbol}</strong>{effect && <span className="onecard-ability">
      <b className="onecard-effect">{effect}</b><small className="onecard-description">{cardDescription(card)}</small>
    </span>}</>
}
