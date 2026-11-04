import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import yeopjeon from '../../assets/entry/yeopjeon-icon.webp'
import { AlkkagiItemCard } from './AlkkagiItemCard'
import { UsedCardTimeline, visibleUsedCards, type UsedCard } from './presentation'
import type { Alkkagi } from './protocol'
import '../omok/omokCoinToss.css'
import './presentation.css'

export function AlkkagiCoinToss({ state, now, name }: { state: Alkkagi; now: number; name: string }) {
  const until = state.coinTossEndsAt ? Date.parse(state.coinTossEndsAt) : 0
  const delay = useMemo(() => -Math.max(0, 2500 - (until - state.serverNow)), [until, state.serverNow])
  if (!until || now >= until || state.status === 'FINISHED') return null
  return <div className="omok-coin-toss" role="status" aria-label="알까기 선공 추첨">
    <div className="omok-coin-paper"><p>엽전으로 선공을 정해요</p>
      <div className="omok-toss-stage" style={{ '--toss-delay': `${delay}ms` } as CSSProperties} aria-hidden="true">
        <div className="omok-toss-shadow" /><div className="omok-toss-coin">
          <img className="omok-toss-front" src={yeopjeon} alt="" /><img className="omok-toss-back" src={yeopjeon} alt="" />
        </div>
      </div><strong>{until - now < 900 ? `${name} · 선공` : '엽전을 던지는 중…'}</strong>
    </div>
  </div>
}

export function AlkkagiOpponentCards({ count, nickname }: { count: number; nickname: string }) {
  return <aside className="alkkagi-opponent-hand" aria-label={`${nickname} 비책 ${count}장`}>
    <header><span>{nickname}</span><small>비책 <b>{count}</b>장</small></header><div aria-hidden="true">
      {Array.from({ length: Math.min(count, 12) }, (_, i) => <span key={i} className="alkkagi-card-back">策</span>)}
    </div>
  </aside>
}

export function AlkkagiUsedCard({ state, now, name, viewerActor = -1 }: { state: Alkkagi; now: number; name(actor: number): string; viewerActor?: number }) {
  const timeline = useRef(new UsedCardTimeline())
  const [queue, setQueue] = useState<UsedCard[]>([])
  useEffect(() => {
    const added = visibleUsedCards(timeline.current.accept(state.gameId, state.itemEffects ?? [], state.serverNow), viewerActor)
    if (added.length) setQueue(previous => [...previous, ...added].slice(-16))
  }, [state.gameId, state.version, viewerActor])
  const card = queue[0]
  useEffect(() => {
    if (queue.some(item => now - item.at >= 6000)) setQueue(current => current.filter(item => now - item.at < 6000))
  }, [now])
  useEffect(() => {
    if (!card) return
    const timer = setTimeout(() => setQueue(current => current.slice(1)), 2200)
    return () => clearTimeout(timer)
  }, [card])
  if (!card) return null
  return <AlkkagiUsedCardNotice key={`${state.gameId}:${card.version}`} card={card} nickname={name(card.actor)} />
}

export function AlkkagiUsedCardNotice({ card, nickname }: { card: UsedCard; nickname: string }) {
  return <div className="alkkagi-used-card" role="status" aria-label="비책 발동">
    <strong>{nickname} <span>비책 발동!</span></strong>
    <div className="alkkagi-used-flip"><span className="alkkagi-card-back" aria-hidden="true">策</span><div className="alkkagi-used-front"><AlkkagiItemCard type={card.type} eager /></div></div>
  </div>
}
