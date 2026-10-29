import { useState, useSyncExternalStore, type CSSProperties } from 'react'
import type { Card } from './protocol'
import { fanPose, HAND_PAGE_SIZE } from './uiState'
import { HandCard } from './HandCard'

interface Props {
  cards: readonly Card[]; playableIds: readonly string[]; flippedIds: readonly string[]
  scope: string; selectedId?: string; canPlay(id: string): boolean; select(id: string): void
  grab(id: string): void; play(id: string): void; restore(): void
}
const smallScreen = () => window.matchMedia('(max-width: 800px)').matches
const subscribeScreen = (notify: () => void) => {
  const media = window.matchMedia('(max-width: 800px)')
  media.addEventListener('change', notify)
  return () => media.removeEventListener('change', notify)
}
export function FanHand({ cards, playableIds, flippedIds, scope, selectedId, canPlay, select, grab, play, restore }: Props) {
  const compact = useSyncExternalStore(subscribeScreen, smallScreen, () => false)
  const pageSize = compact ? 3 : HAND_PAGE_SIZE
  const [page, setPage] = useState(0), pages = Math.max(1, Math.ceil(cards.length / pageSize))
  const [drag, setDrag] = useState<{ id: string; ready: boolean } | null>(null)
  const current = Math.min(page, pages - 1), visible = cards.slice(current * pageSize, (current + 1) * pageSize)
  return <>
    {pages > 1 && <nav className="onecard-hand-pages" aria-label="손패 묶음 탐색">
      <button disabled={current === 0} onClick={() => setPage(current - 1)}>이전 손패</button>
      <span>{current + 1} / {pages} 묶음 · 전체 {cards.length}장</span>
      <button disabled={current === pages - 1} onClick={() => setPage(current + 1)}>다음 손패</button>
    </nav>}
    <div className="onecard-hand" aria-label="나만 볼 수 있는 카드" style={{ '--fan-count': visible.length } as CSSProperties} data-dragging={!!drag}>
      {drag && <div className="onecard-drop-guide" role="status" data-ready={drag.ready}>
        <span aria-hidden="true">↑</span><span>{drag.ready ? '놓으면 카드를 내요' : '카드를 위로 올려주세요'}</span>
      </div>}
      {visible.map((card, index) => {
        const flipped = flippedIds.includes(card.id) && selectedId !== card.id
        const playable = playableIds.includes(card.id) && canPlay(card.id)
        const pose = fanPose(index, visible.length)
        return <HandCard key={card.id} card={card} scope={scope} index={index} angle={pose.angle} lift={pose.lift}
          flipped={flipped} selected={selectedId === card.id} playable={playable} canPlay={() => canPlay(card.id)}
          select={() => select(card.id)} grab={() => grab(card.id)} play={() => play(card.id)} restore={restore} dragging={setDrag} />
      })}
    </div>
  </>
}
