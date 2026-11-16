import type { RankingDisplayColumn } from './service'

export type RankingKind = RankingDisplayColumn['key']
export const rankingInk = {
  wood: '#59412b', pine: '#29483a', paper: '#f3ecd6', cream: '#fff7df', gold: '#c7a360', muted: '#7c7867',
}
// The world sign and detail sheet share the same engraved category symbols.
export const rankingGlyph: Record<RankingKind | 'trophy', string> = {
  balance: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM9 9h6v6H9Z',
  mole: 'm6 4 10 4-3 7-10-4ZM11 14l-3 7M17 3l3 1M18 8l3 1',
  speedMole: 'm14 2-9 12h6l-1 8 9-12h-6Z',
  jumpRope: 'M5 6v7a7 7 0 0 0 14 0V6M3 3h4v6H3ZM17 3h4v6h-4Z',
  jumpmap: 'M3 21v-5h6v-5h6V6h6M13 3h8v8',
  bungeoppang: 'M18 8c-4-6-12-5-15 4 3 9 11 10 15 4l4 4V4ZM6 11h.1M10 8l3 4-3 4',
  skewer: 'M3 22 22 3M6 12l6 6 4-4-6-6ZM12 6l6 6 4-4-6-6Z',
  trophy: 'M7 3h10v6a5 5 0 0 1-10 0ZM7 5H3v3a4 4 0 0 0 5 4M17 5h4v3a4 4 0 0 1-5 4M12 14v5M7 21h10M9 19h6',
}

/** Keep the type legible instead of squeezing a long name into a narrow column. */
export function fitRankingText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (context.measureText(text).width <= maxWidth) return text
  const letters = Array.from(text)
  while (letters.length && context.measureText(letters.join('') + '…').width > maxWidth) letters.pop()
  return letters.join('') + '…'
}
