import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { AlkkagiItemCard } from './AlkkagiItemCard'
import type { AlkkagiHand, Card } from './protocol'
import './cardReveal.css'

/** 새 서버 손패만 연출한다. 최초 조회·재접속 손패는 획득으로 표시하지 않는다. */
export function AlkkagiCardAward({ hand }: { hand: AlkkagiHand | null | undefined }) {
  const previous = useRef<{ gameId: string; ids: Set<string> } | null>(null)
  const [award, setAward] = useState<Card | null>(null)
  useEffect(() => {
    if (!hand) { previous.current = null; setAward(null); return }
    const before = previous.current
    previous.current = { gameId: hand.gameId, ids: new Set(hand.cards.map(c => c.id)) }
    if (!before || before.gameId !== hand.gameId) { setAward(null); return }
    const added = hand.cards.find(c => !before.ids.has(c.id))
    if (added) setAward(added)
  }, [hand])
  useEffect(() => {
    if (!award) return
    const timer = setTimeout(() => setAward(null), 1900)
    return () => clearTimeout(timer)
  }, [award])
  return award && <div key={award.id} className="alkkagi-card-award" role="status" aria-label="비책 획득">
    <div className="alkkagi-award-rays" aria-hidden="true" />
    <div className="alkkagi-award-card"><AlkkagiItemCard type={award.type} /></div>
    <strong>비책 획득!</strong>
  </div>
}

export function AlkkagiChoiceFan({ choice, ready, seconds, choose }: {
  choice: NonNullable<AlkkagiHand['choice']>; ready: boolean; seconds: number; choose(optionId: string): void
}) {
  const [picked, setPicked] = useState<string | null>(null)
  return <div className="alkkagi-choice alkkagi-choice-reveal" role="dialog" aria-modal="true" aria-label="카드 선택">
    <small>운명을 바꿀 비책</small><h3>한 장을 선택하세요 · {seconds}초</h3>
    <div className="alkkagi-choice-fan">{choice.options.map((card, index) =>
      <div key={card.id} className="alkkagi-choice-slot" data-picked={picked === card.id}
        style={{ '--card-index': index, '--fan-angle': `${(index - 1) * 7}deg` } as CSSProperties}>
        <AlkkagiItemCard type={card.type} selected={picked === card.id} disabled={!ready || seconds <= 0}
          onClick={() => { setPicked(card.id); choose(card.id) }} />
      </div>)}</div>
    <p>시간이 끝나면 서버가 한 장을 무작위로 선택합니다</p>
  </div>
}
