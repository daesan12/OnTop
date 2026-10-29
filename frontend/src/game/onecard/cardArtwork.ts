import type { Card } from './protocol'

const suitCode = { hearts: 'H', diamonds: 'D', clubs: 'C', spades: 'S' } as const

/** Local faces and reference-based joker redraws; never use private card IDs in URLs. */
export function cardArtwork(card: Card) {
  return card.suit ? `/art/onecard/classic/${suitCode[card.suit]}-${card.rank}.svg`
    : `/art/onecard/${card.rank === 'joker-color' ? 'joker-moon-color' : 'joker-moon-black'}.webp`
}
