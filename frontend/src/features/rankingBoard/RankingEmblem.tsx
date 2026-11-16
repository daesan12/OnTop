import { rankingGlyph, type RankingKind } from './presentation'

export function RankingEmblem({ kind }: { kind: RankingKind | 'trophy' }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d={rankingGlyph[kind]} />
  </svg>
}
