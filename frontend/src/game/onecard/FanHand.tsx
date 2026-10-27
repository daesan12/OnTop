import { useState, useSyncExternalStore, type CSSProperties } from 'react'
import type { Card } from './protocol'
import { CardFace } from './CardFace'
import { cardLabel, cardEffect, redCard } from './presentation'
import { fanPose, HAND_PAGE_SIZE } from './uiState'

interface Props {
  cards: readonly Card[]; playableIds: readonly string[]; flippedIds: readonly string[]
  selectedId?: string; canPlay(id: string): boolean; select(id: string): void; restore(): void
}
const smallScreen = () => window.matchMedia('(max-width: 800px)').matches
const subscribeScreen = (notify: () => void) => {
  const media = window.matchMedia('(max-width: 800px)')
  media.addEventListener('change', notify)
  return () => media.removeEventListener('change', notify)
}
export function FanHand({ cards, playableIds, flippedIds, selectedId, canPlay, select, restore }: Props) {
  const compact = useSyncExternalStore(subscribeScreen, smallScreen, () => false)
  const pageSize = compact ? 5 : HAND_PAGE_SIZE
  const [page, setPage] = useState(0), pages = Math.max(1, Math.ceil(cards.length / pageSize))
  const current = Math.min(page, pages - 1), visible = cards.slice(current * pageSize, (current + 1) * pageSize)
  return <>
    {pages > 1 && <nav className="onecard-hand-pages" aria-label="손패 묶음 탐색">
      <button disabled={current === 0} onClick={() => setPage(current - 1)}>이전 손패</button>
      <span>{current + 1} / {pages} 묶음 · 전체 {cards.length}장</span>
      <button disabled={current === pages - 1} onClick={() => setPage(current + 1)}>다음 손패</button>
    </nav>}
    <div className="onecard-hand" aria-label="나만 볼 수 있는 카드" style={{ '--fan-count': visible.length } as CSSProperties}>
      {visible.map((card, index) => {
        const flipped = flippedIds.includes(card.id) && selectedId !== card.id
        const playable = playableIds.includes(card.id) && canPlay(card.id)
        const pose = fanPose(index, visible.length)
        return <button key={card.id} className={`onecard-card onecard-hand-card ${redCard(card) && !flipped ? 'red' : ''}`}
          style={{ '--fan-angle': `${pose.angle}deg`, '--fan-lift': `${pose.lift}px`, '--fan-index': index } as CSSProperties}
          data-flipped={flipped} data-playable={!flipped && playable} aria-pressed={!flipped && selectedId === card.id}
          aria-label={flipped ? '뒤집힌 카드 · 모든 손패 복구' : [cardLabel(card), cardEffect(card)].filter(Boolean).join(' · ')}
          disabled={!flipped && !canPlay(card.id)} onClick={() => flipped ? restore() : select(card.id)}>
          <span className="onecard-card-rotator">
            <span className="onecard-card-front">{!flipped && <CardFace card={card} />}</span>
            <span className="onecard-card-back" aria-hidden="true"><span>✦</span></span>
          </span>
        </button>
      })}
    </div>
  </>
}
