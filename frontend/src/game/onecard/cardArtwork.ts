import type { Card } from './protocol'

const suitCode = { hearts: 'H', diamonds: 'D', clubs: 'C', spades: 'S' } as const

/** Local CC0 vector faces; never derive a filename from a private card ID. */
export function cardArtwork(card: Card) {
  const face = card.suit ? `${suitCode[card.suit]}-${card.rank}` : card.rank === 'joker-color' ? 'J-1' : 'J-2'
  return `/art/onecard/classic/${face}.svg`
}
