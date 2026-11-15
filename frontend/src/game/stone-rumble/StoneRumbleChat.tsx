import { useEffect, useRef, useState } from 'react'
import chatIcon from '../../features/parkMenus/icons/chat-bubble.svg'
import sendIcon from '../../features/parkMenus/icons/chat-send.svg'

export interface StoneChatMessage { id: string; userId: string; text: string }
export interface StoneChatPort {
  messages: readonly StoneChatMessage[]
  canSend: boolean
  send(text: string): Promise<boolean>
}

/** 전송·권한은 기존 경기 채팅 포트가 담당하고 이 컴포넌트는 표시/입력만 맡는다. */
export function StoneRumbleChat({ chat, open, onOpenChange, name }: {
  chat: StoneChatPort; open: boolean; onOpenChange(open: boolean): void; name(id: string): string
}) {
  const [draft, setDraft] = useState(''), [sending, setSending] = useState(false), [notice, setNotice] = useState('')
  const input = useRef<HTMLInputElement>(null), log = useRef<HTMLDivElement>(null)
  const pending = useRef(false), mounted = useRef(false), follow = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => { if (open) { input.current?.focus(); follow.current = true } }, [open])
  useEffect(() => { if (log.current && follow.current) log.current.scrollTop = log.current.scrollHeight }, [chat.messages, open])
  const close = () => { onOpenChange(false); input.current?.blur() }
  async function send() {
    if (pending.current || !chat.canSend) return
    if (!draft.trim()) { close(); return }
    pending.current = true; setSending(true); setNotice('')
    try {
      const approved = await chat.send(draft)
      if (!mounted.current) return
      if (approved) { setDraft(''); close() }
      else setNotice('전송하지 못했어요. 내용을 보관했으니 잠시 후 다시 보내주세요.')
    } catch { if (mounted.current) setNotice('연결을 확인해 주세요. 입력한 내용은 보관했어요.') }
    finally { pending.current = false; if (mounted.current) setSending(false) }
  }
  return <>
    {(open || chat.messages.length > 0) && <section className="stone-rumble-chat" data-open={open} aria-label="경기 채팅"
      onKeyDown={event => {
        if (open && event.key === 'Escape' && !event.nativeEvent.isComposing) {
          event.preventDefault(); event.stopPropagation(); close()
        }
      }}>
      {open && <header><strong><img src={chatIcon} alt="" />경기 채팅</strong><span>이 경기만</span><button type="button" aria-label="채팅 닫기" onClick={close}>×</button></header>}
      <div ref={log} className="stone-rumble-chat-log" role="log" aria-live="polite" aria-relevant="additions"
        onScroll={event => { const el = event.currentTarget; follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24 }}>
        {(open ? chat.messages : chat.messages.slice(-2)).map(message => <p key={message.id}><b title={name(message.userId)}>{name(message.userId)}</b><span>{message.text}</span></p>)}
        {open && !chat.messages.length && <p className="stone-rumble-chat-empty">참가자와 관전자가 함께 대화해요.</p>}
      </div>
      {open && <form onSubmit={event => { event.preventDefault(); void send() }}>
        <label className="visually-hidden" htmlFor="stone-rumble-chat-input">경기 채팅 메시지</label>
        <input id="stone-rumble-chat-input" ref={input} value={draft} maxLength={200} readOnly={sending} autoComplete="off" placeholder="메시지를 입력하세요"
          onChange={event => setDraft(event.target.value)} onKeyDown={event => {
            if (event.key !== 'Enter' && event.key !== 'Escape') return
            event.stopPropagation()
            if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) { event.preventDefault(); return }
            event.preventDefault()
            if (!event.repeat) { if (event.key === 'Escape') close(); else void send() }
          }} />
        <button type="submit" aria-label="메시지 보내기" disabled={sending || !chat.canSend}><img src={sendIcon} alt="" /></button>
      </form>}
      {open && (!chat.canSend || notice) && <p role="status">{notice || '연결 또는 경기 시작 상태를 확인하고 있어요.'}</p>}
    </section>}
  </>
}
