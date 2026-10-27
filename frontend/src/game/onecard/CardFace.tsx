import { cardEffect, SUIT_GLYPH } from './presentation'
import type { Card } from './protocol'

export function CardFace({ card }: { card: Card }) {
  const rank = card.suit ? card.rank : 'JOKER', symbol = card.suit ? SUIT_GLYPH[card.suit] : '✦'
  return <><span className="onecard-corner"><span>{rank}</span><span>{symbol}</span></span>
    <strong className="onecard-symbol">{symbol}</strong><small>{cardEffect(card)}</small></>
}
