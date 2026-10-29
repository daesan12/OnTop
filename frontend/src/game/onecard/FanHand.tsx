import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import type { Card } from './protocol'
import { fanPose, privateHandLayout } from './uiState'
import { HandCard } from './HandCard'

interface Props {
  cards: readonly Card[]; playableIds: readonly string[]; flippedIds: readonly string[]
  scope: string; selectedId?: string; canPlay(id: string): boolean; select(id: string): void
  grab(id: string): void; play(id: string): void; restore(): void
}
export function FanHand({ cards, playableIds, flippedIds, scope, selectedId, canPlay, select, grab, play, restore }: Props) {
  const root = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState(() => ({ width: Math.min(1060, innerWidth - 24), height: innerHeight }))
  useLayoutEffect(() => {
    const update = () => {
      const width = root.current?.clientWidth ?? 0, height = innerHeight
      if (width) setSize(old => old.width === width && old.height === height ? old : { width, height })
    }
    const observer = new ResizeObserver(update)
    if (root.current) observer.observe(root.current)
    window.addEventListener('resize', update); update()
    return () => { observer.disconnect(); window.removeEventListener('resize', update) }
  }, [])
  const layout = privateHandLayout(cards.length, size.width, size.height)
  const [drag, setDrag] = useState<{ id: string; ready: boolean } | null>(null)
  return <>
    <div ref={root} className="onecard-hand" aria-label="나만 볼 수 있는 카드" style={{ '--fan-count': cards.length,
      '--card-width': `${layout.cardWidth}px`, '--fan-step': `${layout.step}px`, '--preview-scale': Math.min(2.5, Math.max(1.12, 100 / layout.cardWidth)) } as CSSProperties} data-dragging={!!drag} data-dense={cards.length > 12}>
      {drag && <div className="onecard-drop-guide" role="status" data-ready={drag.ready}>
        <span aria-hidden="true">↑</span><span>{drag.ready ? '놓으면 카드를 내요' : '카드를 위로 올려주세요'}</span>
      </div>}
      {cards.map((card, index) => {
        const flipped = flippedIds.includes(card.id) && selectedId !== card.id
        const playable = playableIds.includes(card.id) && canPlay(card.id)
        const pose = fanPose(index, cards.length)
        return <HandCard key={card.id} card={card} scope={scope} index={index} angle={pose.angle} lift={pose.lift}
          flipped={flipped} selected={selectedId === card.id} playable={playable} canPlay={() => canPlay(card.id)}
          select={() => select(card.id)} grab={() => grab(card.id)} play={() => play(card.id)} restore={restore} dragging={setDrag} />
      })}
    </div>
  </>
}
