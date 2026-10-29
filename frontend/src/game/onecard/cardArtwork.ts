import type { Card } from './protocol'

const suitCode = { hearts: 'H', diamonds: 'D', clubs: 'C', spades: 'S' } as const

/** Local CC0 vector faces; never derive a filename from a private card ID. */
export function cardArtwork(card: Card) {
  return card.suit ? `/art/onecard/classic/${suitCode[card.suit]}-${card.rank}.svg`
    : `/art/onecard/${card.rank === 'joker-color' ? 'joker-color' : 'joker-black'}.svg`
}
