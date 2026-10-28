import { cardEffect, SUIT_GLYPH } from './presentation'
import type { Card } from './protocol'

export function CardFace({ card }: { card: Card }) {
  const rank = card.suit ? card.rank : 'JOKER', symbol = card.suit ? SUIT_GLYPH[card.suit] : '✦'
  const effect = cardEffect(card)
  return <><span className="onecard-corner"><span>{rank}</span><span>{symbol}</span></span>
    <span className="onecard-watermark" aria-hidden="true">{symbol}</span>
    <strong className="onecard-symbol">{symbol}</strong>{effect && <span className="onecard-ability">
      <b className="onecard-effect">{effect}</b>
    </span>}<span className="onecard-corner onecard-corner-bottom" aria-hidden="true"><span>{rank}</span><span>{symbol}</span></span></>
}
