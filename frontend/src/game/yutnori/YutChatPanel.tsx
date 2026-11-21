import { useEffect, useRef, useState } from 'react'
import type { YutClient } from './client'
import type { YutChatScope, YutSnapshot } from './contracts'

export function YutChatPanel({ client, snapshot, busy, focusRequest = 0 }: { client: YutClient; snapshot: YutSnapshot; busy: boolean; focusRequest?: number }) {
  const [open, setOpen] = useState(() => matchMedia('(min-width:1000px) and (min-height:640px)').matches)
  const [scope, setScope] = useState<YutChatScope>('ALL')
  const [drafts, setDrafts] = useState({ ALL: '', TEAM: '' })
  const log = useRef<HTMLDivElement>(null)
  const following = useRef(true)
  const composing = useRef(false)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const query = matchMedia('(min-width:1000px) and (min-height:640px)')
    const update = () => setOpen(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    if (!focusRequest) return
    setOpen(true)
    const frame = requestAnimationFrame(() => { input.current?.focus(); input.current?.scrollIntoView({ block: 'nearest' }) })
    return () => cancelAnimationFrame(frame)
  }, [focusRequest])
  const canTeam = snapshot.role === 'PLAYER' && snapshot.privateState.teamChat !== undefined && snapshot.publicState.phase !== 'WAITING'
  const channel = canTeam ? scope : 'ALL'
  const messages = channel === 'ALL' ? snapshot.publicState.chat : snapshot.privateState.teamChat ?? []
  const last = messages.at(-1)?.id
  useEffect(() => { following.current = true }, [channel])
  useEffect(() => {
    if (log.current && following.current) log.current.scrollTop = log.current.scrollHeight
  }, [channel, last, open])
  const send = async () => {
    const text = drafts[channel]
    if (busy || !text.trim() || composing.current) return
    if (await client.chat(channel, text.trim())) setDrafts(previous => previous[channel] === text ? { ...previous, [channel]: '' } : previous)
  }
  return <section className="yut-chat-panel" data-open={open} aria-label="경기 채팅">
    <button type="button" className="yut-chat-toggle" aria-expanded={open} aria-controls="yut-chat-body" onClick={() => setOpen(value => !value)}>채팅
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d={open ? 'm4 10 4-4 4 4' : 'm4 6 4 4 4-4'} /></svg>
    </button>
    <div className="yut-chat-body" id="yut-chat-body" hidden={!open}>
    <div className="yut-chat-tabs" role="group" aria-label="채팅 공개 범위">
      <button type="button" aria-pressed={channel === 'ALL'} disabled={busy} onClick={() => setScope('ALL')}>전체</button>
      <button type="button" aria-pressed={channel === 'TEAM'} disabled={busy || !canTeam}
        title={canTeam ? '같은 팀에게만 보이는 채팅' : '팀 채팅은 참가자만 사용할 수 있어요'} onClick={() => setScope('TEAM')}>팀</button>
    </div>
    <div ref={log} tabIndex={0} className="yut-chat-log" role="log" aria-live="polite" aria-label={channel === 'ALL' ? '전체 채팅 기록' : '팀 채팅 기록'}
      onScroll={() => { if (log.current) following.current = log.current.scrollHeight - log.current.scrollTop - log.current.clientHeight < 40 }}>
      {messages.length ? messages.map(message => <p key={message.id}><time>{new Date(message.sentAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}</time> <strong>{message.nickname}</strong> <span>{message.text}</span></p>)
        : <p className="yut-chat-empty">{channel === 'TEAM' ? '같은 팀에게만 보이는 대화예요.' : '같은 경기의 참가자·관전자와 대화해요.'}</p>}
    </div>
    <form className="yut-chat-composer" onSubmit={event => { event.preventDefault(); void send() }}>
      <label className="yut-sr-only" htmlFor="yut-chat">{channel === 'ALL' ? '전체 채팅 입력' : '팀 채팅 입력'}</label>
      <input ref={input} id="yut-chat" value={drafts[channel]} maxLength={100} placeholder={channel === 'ALL' ? '전체에게 메시지' : '우리 팀에게 메시지'}
        onCompositionStart={() => { composing.current = true }} onCompositionEnd={() => { composing.current = false }}
        onKeyDown={event => { event.stopPropagation(); if (event.key === 'Enter' && (event.nativeEvent.isComposing || composing.current || event.keyCode === 229)) event.preventDefault() }}
        onChange={event => setDrafts({ ...drafts, [channel]: event.target.value })} />
      <button disabled={busy || !drafts[channel].trim()}>보내기</button>
    </form></div>
  </section>
}
