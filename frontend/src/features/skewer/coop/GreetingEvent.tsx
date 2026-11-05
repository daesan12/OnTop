import { useState } from 'react'
import type { CSSProperties } from 'react'
import type { CoopPublic } from './contracts'
import './greetingEvent.css'

export const GREETING_IMAGE = '/art/skewer/greeting-duo-v1.png'

export function GreetingEvent({ greeting, onGreet }: { greeting: CoopPublic['greeting']; onGreet: () => Promise<void> }) {
  const [pending, setPending] = useState(false)
  const answer = async () => {
    if (pending || greeting.answered) return
    setPending(true)
    try { await onGreet() } finally { setPending(false) }
  }
  return <section className="coop-greeting-event" aria-label="함께 인사하기" data-answered={greeting.answered}>
    <h2>{greeting.answered ? '어서 오세요!' : '함께 인사해요!'}</h2>
    <button className="greeting-portrait" aria-label={greeting.answered ? '인사 완료' : '함께 인사하기'}
      disabled={pending || greeting.answered} onClick={() => void answer()}
      style={{ '--greeting-progress': `${Math.max(0, Math.min(1, greeting.remaining / 5)) * 360}deg` } as CSSProperties}>
      <span className="greeting-orbit" aria-hidden="true"><i /><i /><i /><i /></span>
      <span className="greeting-glimmer" aria-hidden="true" />
      <img src={GREETING_IMAGE} alt="손을 흔들며 인사하는 요리사와 서빙 담당" draggable={false} />
      <span className="greeting-key">{greeting.answered ? '✓ 인사 완료' : pending ? '인사 중…' : <><kbd>G</kbd> 인사하기</>}</span>
    </button>
    <div className="greeting-response" role="status">
      <strong>{greeting.remaining.toFixed(1)}초</strong><span aria-hidden="true">·</span>
      <span>{greeting.answered ? '친구를 기다려요' : `${greeting.responded}/2명 인사 완료`}</span>
    </div>
    <p>영업시간은 계속 흘러요</p>
  </section>
}
