import { useState } from 'react'
import type { Snapshot } from '../game/alkkagi/replay'

export function SocialPanel({ state, connected, sendChat }: { state: Snapshot | null; connected: boolean; sendChat(text: string): void }) {
  const [text, setText] = useState('')
  return <section className="social-panel" aria-label="경기 채팅과 훈수">
    <h2>함께 보기 <small>관전자 {state?.connections?.viewers ?? 0}명</small></h2>
    <p>관전자는 현재 차례의 알을 드래그해 훈수할 수 있어요. 훈수는 실제 알을 움직이지 않습니다.</p>
    {!!state?.social?.advice.length && <ul aria-label="최근 훈수">{state.social.advice.map(a =>
      <li key={a.id}>{a.label}: {a.pieceId} · 힘 {Math.round(a.power * 100)}%</li>)}</ul>}
    <div className="chat-log" role="log" aria-live="polite" aria-label="경기 채팅">
      {state?.social?.chat.map(m => <p key={m.id}><strong>{m.label}</strong> {m.text}</p>)}
    </div>
    <form onSubmit={e => { e.preventDefault(); const value = text.trim(); if (connected && value) { sendChat(value); setText('') } }}>
      <input aria-label="채팅 내용" maxLength={200} value={text} disabled={!connected} onChange={e => setText(e.target.value)} placeholder="모두에게 한마디 (200자)" />
      <button disabled={!connected || !text.trim()}>보내기</button>
    </form>
  </section>
}
