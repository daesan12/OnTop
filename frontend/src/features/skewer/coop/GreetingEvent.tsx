import { useState } from 'react'
import type { CSSProperties } from 'react'
import type { CoopPublic } from './contracts'
import './greetingEvent.css'

export const GREETING_IMAGE = '/art/skewer/greeting-duo-v1.png'
export const MISSED_GREETING_IMAGE = '/art/skewer/greeting-missed-v1.webp'

export function GreetingEvent({ greeting, onGreet }: { greeting: CoopPublic['greeting']; onGreet: () => Promise<void> }) {
  const [pending, setPending] = useState(false)
  const resolved = !greeting.active, missed = greeting.outcome === 'missed'
  const answer = async () => {
    if (pending || greeting.answered || resolved) return
    setPending(true)
    try { await onGreet() } finally { setPending(false) }
  }
  return <section className="coop-greeting-event" aria-label={resolved ? '인사 결과' : '함께 인사하기'} data-outcome={greeting.outcome || undefined} data-answered={greeting.answered}>
    <h2>{resolved ? missed ? '아쉬워요!' : '인사 완료!' : greeting.answered ? '어서 오세요!' : '함께 인사해요!'}</h2>
    <button className="greeting-portrait" aria-label={greeting.answered ? '인사 완료' : '함께 인사하기'}
      disabled={resolved || pending || greeting.answered} onClick={() => void answer()}
      style={{ '--greeting-progress': `${Math.max(0, Math.min(1, greeting.remaining / 5)) * 360}deg` } as CSSProperties}>
      <span className="greeting-orbit" aria-hidden="true"><i /><i /><i /><i /></span>
      <span className="greeting-glimmer" aria-hidden="true" />
      <img src={missed ? MISSED_GREETING_IMAGE : GREETING_IMAGE} alt={missed ? '인사를 놓쳐 아쉬워하는 요리사와 서빙 담당' : '손을 흔들며 인사하는 요리사와 서빙 담당'} draggable={false} />
      <span className="greeting-key">{resolved ? missed ? '다음엔 함께 인사해요' : `보너스 +${greeting.bonus ?? 0}점` : greeting.answered ? '✓ 인사 완료' : pending ? '인사 중…' : <><kbd>G</kbd> 인사하기</>}</span>
    </button>
    <div className="greeting-response" role="status">
      {resolved ? <span>{missed ? '손님을 다시 맞이할 기회가 있어요' : '두 사람의 인사가 손님에게 닿았어요'}</span> : <><strong>{greeting.remaining.toFixed(1)}초</strong><span aria-hidden="true">·</span>
      <span>{greeting.answered ? '친구를 기다려요' : `${greeting.responded}/2명 인사 완료`}</span></>}
    </div>
    <p>영업시간은 계속 흘러요</p>
  </section>
}
