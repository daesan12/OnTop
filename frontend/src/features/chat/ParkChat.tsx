import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useSession } from '../../network/worldClient'
import { parkName } from '../parkMenus/parkName'
import { useParkRuntime } from '../../park/runtime/ParkRuntime'
import { inputState, setChatInputOpen } from '../../world/inputOwnership'
import { CHAT } from './settings'
import chatIcon from '../parkMenus/icons/chat-bubble.svg'
import sendIcon from '../parkMenus/icons/chat-send.svg'
import expandIcon from '../parkMenus/icons/chevron-channel.svg'
import { useGame } from '../../game/store'
import { useOmokEvents } from '../../game/omok/spectatorEvents'
import { gameChatScope } from './gameChat'
import { noteTourAction } from '../welcomeTour/state'
import { displayNickname } from '../gameMaster/displayName'

const textControl = (target: EventTarget | null) => target instanceof HTMLElement
  && !!target.closest('input,textarea,select,button,a,[contenteditable="true"],[role="button"]')
const anotherPanel = () => Object.entries(inputState).some(([key, value]) => value && key !== 'chatOpen')
  || !!document.querySelector('dialog[open],[role="dialog"]:not(.table-tablet[data-active="true"])')

export function ParkChat() {
  const gameId = useGame(gameChatScope), channel = useSession(s => s.roomId)
  return <ChatPanel key={`${channel}/${gameId}`} gameId={gameId} />
}
function ChatPanel({ gameId }: { gameId: string }) {
  const runtime = useParkRuntime()
  const historyMessages = useOmokEvents(s => s.history), gameCanSend = useOmokEvents(s => s.canSend)
  const session = useSession(useShallow(s => ({ messages: s.messages, profiles: s.profiles,
    own: s.sessionId, channel: s.roomId, pending: s.pending, connected: s.status === 'connected' })))
  const channelName = useSession(s => s.roomId ? parkName(s.channelName) : '')
  const [open, setOpen] = useState(false), [history, setHistory] = useState(false)
  const [previewUntil, setPreviewUntil] = useState(0), [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false), [notice, setNotice] = useState('')
  const input = useRef<HTMLInputElement>(null), log = useRef<HTMLDivElement>(null)
  const followLatest = useRef(true), inFlight = useRef(false), alive = useRef(false)
  const expanded = open || history || previewUntil > 0
  const full = open || history
  const feed = gameId ? historyMessages.filter(message => message.gameId === gameId).map(message => ({
    id: message.eventId, userId: message.senderUserId, text: message.text,
  })) : session.messages
  const messages = full ? feed : feed.slice(-(expanded ? CHAT.previewRows : CHAT.collapsedRows))

  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => {
    setChatInputOpen(open)
    if (open) input.current?.focus()
    return () => setChatInputOpen(false)
  }, [open])
  useEffect(() => {
    if (log.current && followLatest.current) log.current.scrollTop = log.current.scrollHeight
  }, [session.messages, historyMessages, full, expanded])
  useEffect(() => {
    if (!previewUntil) return
    const timer = setTimeout(() => setPreviewUntil(0), Math.max(0, previewUntil - Date.now()))
    return () => clearTimeout(timer)
  }, [previewUntil])

  function close(preview = false) {
    setOpen(false)
    setPreviewUntil(preview ? Date.now() + CHAT.expandedDurationMs : 0)
    followLatest.current = true
    input.current?.blur()
  }
  function openInput() { followLatest.current = true; setNotice(''); setOpen(true) }
  function toggleHistory() { followLatest.current = true; setHistory(s => !s); setPreviewUntil(0) }
  async function send() {
    if (inFlight.current) return
    if (!draft.trim()) { setNotice(''); close(true); return }
    inFlight.current = true; setSending(true); setNotice('')
    const approved = await runtime.sendChat(draft)
    inFlight.current = false
    if (!alive.current) return
    setSending(false)
    if (!approved) { setNotice('전송하지 못했어요. 내용을 보관했으니 안내를 확인하고 다시 보내주세요.'); return }
    noteTourAction('chat')
    setDraft(''); close(true)
  }
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.repeat
        || event.ctrlKey || event.altKey || event.metaKey || anotherPanel()) return
      if ((textControl(event.target) && event.target !== input.current)
        || (textControl(document.activeElement) && document.activeElement !== input.current)) return
      if (event.code === 'Escape' && (open || history || previewUntil)) {
        event.preventDefault(); setHistory(false); close(); return
      }
      if (event.code === 'KeyZ' && event.target !== input.current) {
        event.preventDefault(); toggleHistory(); return
      }
      if (event.code === 'Enter' && event.target !== input.current) {
        event.preventDefault(); openInput()
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [open, history, previewUntil])

  return <section className="park-chat" aria-label={gameId ? '경기 채팅' : '주변 채팅'} data-game-id={gameId || undefined} data-expanded={expanded} data-history={history}>
    <div className="park-chat__messages">
      <div className="park-chat__heading"><h1><img src={chatIcon} alt="" />{gameId ? '경기 채팅' : '주변 채팅'}<span className="park-chat__radius">{gameId ? '이 경기만' : `반경 ${CHAT.radiusMeters}m`}</span></h1>
        <button type="button" aria-label="채팅 기록 보기" aria-expanded={history} aria-keyshortcuts="Z" onClick={toggleHistory}
          title={history ? 'Z · 기록 접기' : 'Z · 기록 보기'}>
          <img src={expandIcon} alt="" /><span className="visually-hidden">Z {history ? '기록 접기' : '기록 보기'}</span>
        </button>
      </div>
      <div className="park-chat__list" ref={log} role="log" aria-live="polite" aria-relevant="additions"
        onScroll={event => { const el = event.currentTarget; followLatest.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24 }}>
        {channelName && (expanded || !messages.length) && <p className="park-chat__system">{gameId ? '참가자와 승인된 관전자에게만 보여요' : `${channelName} 채널에 입장했어요`}</p>}
        {messages.map(message => <p className="park-chat__message" key={message.id}>
          <span className={'park-chat__author' + (message.userId === session.own ? ' park-chat__author--own' : '')}
            title={displayNickname(session.profiles[message.userId], message.userId === session.own ? '나' : '산책자 ' + message.userId.slice(-6))}>
            {displayNickname(session.profiles[message.userId], message.userId === session.own ? '나' : '산책자 ' + message.userId.slice(-6))}
          </span><span>{message.text}</span>
        </p>)}
      </div>
      {full && <small className="park-chat__history-hint">이번 접속에서 받은 최근 {CHAT.historyLimit}개 · 스크롤로 이전 대화</small>}
    </div>
    {notice && <p className="park-chat__notice" role="status">{notice}</p>}
    {open ? <form className="park-chat__composer park-chat__composer--open" onSubmit={event => { event.preventDefault(); void send() }}>
      <label className="visually-hidden" htmlFor="park-chat-input">{gameId ? '경기 채팅 메시지' : '주변 채팅 메시지'}</label>
      <input id="park-chat-input" ref={input} value={draft} readOnly={sending} onChange={event => setDraft(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)) event.preventDefault()
        }} placeholder={gameId ? '이 경기 안에서만 대화해요' : '메시지를 입력하세요'} maxLength={gameId ? 200 : 400} autoComplete="off" />
      <button type="button" aria-label="채팅 입력창 닫기" onClick={() => close()}>×</button>
      <button type="submit" aria-label="메시지 보내기" disabled={sending || session.pending || !session.channel || !session.connected || !!gameId && !gameCanSend}><img src={sendIcon} alt="" /></button>
    </form> : <button className="park-chat__composer park-chat__composer--closed" type="button" onClick={openInput} aria-label="채팅 입력창 열기"
      aria-keyshortcuts="Enter" disabled={!!gameId && !gameCanSend}>
      <span>메시지를 입력하세요</span><span className="park-chat__send-icon"><img src={sendIcon} alt="" /></span>
    </button>}
  </section>
}
