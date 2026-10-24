import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import coinImage from '../assets/yeopjeon-icon.png'
import leafImage from '../assets/park-leaf.png'
import peopleImage from '../assets/park-people.png'
import avatarImage from '../assets/park-avatar.png'
import { ParkScene } from './ParkScene'
import './park.css'
import './scene.css'
import { useShallow } from 'zustand/react/shallow'
import { useSession } from '../network/worldClient'
import { ParkRuntimeProvider, useParkRuntime } from './runtime/ParkRuntime'
import { setChatInputOpen } from '../world/input'
import { ParkTools } from './ParkTools'
import type { QualityPreset } from '../config'
import { ParkInteractionHint } from '../features/interactions/ParkInteractionHint'
import { EmoteWheel } from '../features/emotes/EmoteWheel'
import { TelescopePanel } from '../features/telescopes/TelescopePanel'
import { FeedbackPanel } from '../features/feedback/FeedbackPanel'
import { AnonymousNotes } from '../features/notes/AnonymousNotes'
import { ManualHost } from '../features/manual/ManualHost'
import { ManualWorldActions } from '../features/manual/ManualWorldActions'
import { resetMetrics } from '../performance/metrics'
import { ParkMap } from '../features/navigation/ParkMap'
import { ParkNavigation } from '../features/navigation/NavigationHud'
import { inputState } from '../world/inputOwnership'
import { BungeoppangHud } from '../features/bungeoppang/BungeoppangHud'
import { useBungeoppang } from '../features/bungeoppang/store'

const shortcuts = [
  { key: 'WASD', action: '이동' },
  { key: 'Shift', action: '달리기' },
  { key: 'Space', action: '점프' },
  { key: 'M', action: '지도' },
  { key: 'G', action: '감정표현' },
]

function isTextControl(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest('input, textarea, select, button, a, [contenteditable="true"], [role="button"]'))
}

function getHudScale(): number {
  if (window.innerWidth <= 900) return 1
  return Math.min(1, window.innerWidth / 1920, window.innerHeight / 1080)
}

type ParkProps = { onExit: () => void; exitError: string; onAuthEnded: () => void }
export function ParkPage(props: ParkProps) {
  return <ParkRuntimeProvider onAuthEnded={props.onAuthEnded}><ParkContent {...props}/></ParkRuntimeProvider>
}
function ParkContent({ onExit, exitError }: ParkProps) {
  const bungeoppang = useBungeoppang(s => s.phase !== 'idle')
  const runtime = useParkRuntime()
  const session = useSession(useShallow(s=>({ status:s.status,channelName:s.channelName,playerCount:s.playerCount,capacity:s.capacity,sessionId:s.sessionId,roomId:s.roomId,messages:s.messages,pending:s.pending,account:s.account,profiles:s.profiles })))
  const [quality,setQuality] = useState<QualityPreset>('low')
  const changeQuality = useCallback((value: QualityPreset) => {
    setQuality(value)
    resetMetrics()
  }, [])
  const parkView = { name:session.channelName || '채널 선택', players:session.playerCount, capacity:session.capacity, nickname:session.account?.nickname ?? '정보 미연동' }
  const messages = session.messages.map(message=>({ ...message,name:session.profiles[message.userId]?.nickname ?? (message.userId===session.sessionId?'나':('산책자 '+message.userId.slice(-6))),own:message.userId===session.sessionId }))
  const [hudScale, setHudScale] = useState(getHudScale)
  const [chatOpen, setChatOpen] = useState(false)
  const [draft, setDraft] = useState('')

  const inputRef = useRef<HTMLInputElement>(null)
  const messageListRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const updateScale = () => setHudScale(getHudScale())
    window.addEventListener('resize', updateScale)
    return () => window.removeEventListener('resize', updateScale)
  }, [])

  useEffect(() => {
    setChatInputOpen(chatOpen)
    if (chatOpen) inputRef.current?.focus()
    return () => setChatInputOpen(false)
  }, [chatOpen])

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (inputState.manualOpen || inputState.mapOpen || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return
      if (event.key === 'Escape' && chatOpen) {
        setChatOpen(false)
        inputRef.current?.blur()
        return
      }
      if (event.key === 'Enter' && !isTextControl(event.target)) {
        event.preventDefault()
        setChatOpen(!chatOpen)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [chatOpen])

  useEffect(() => {
    messageListRef.current?.scrollTo({ top: messageListRef.current.scrollHeight })
  }, [messages])

  const sendMessage = async () => {
    if (!await runtime.sendChat(draft)) return
    setDraft('')
    setChatOpen(false)
    inputRef.current?.blur()
  }

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
      event.preventDefault()
      void sendMessage()
    }
  }

  return (
    <main className="park-page" aria-label="공원 기본 화면" data-bungeoppang={bungeoppang} style={{
      '--park-ui-scale': hudScale,
      '--park-edge': `${30 * hudScale}px`,
      '--park-shortcuts-half-width': `${390 * hudScale}px`,
    } as CSSProperties}>
      <ParkScene quality={quality} />
      <div className="park-hud">
        <section className="park-location" aria-label="현재 공원과 접속 인원" role="button" tabIndex={0} aria-haspopup="true" onClick={()=>window.dispatchEvent(new Event('ontop-toggle-channels'))} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();window.dispatchEvent(new Event('ontop-toggle-channels'))}}}>
          <img className="park-location__leaf" src={leafImage} alt="" />
          <div className="park-location__details">
            <div className="park-location__name">{parkView.name}</div>
            <div className="park-location__population">
              <img src={peopleImage} alt="" />
              <span>{parkView.players} / {parkView.capacity}</span>
            </div>
          </div>
          <span className="park-chevron" aria-hidden="true" />
        </section>

        <div className="park-account">
          <div className="park-account__summary" aria-label="내 정보">
            <img className="park-account__coin" src={coinImage} alt="엽전" />
            <span className="park-account__balance">{session.account?.balance == null ? '—' : session.account.balance.toLocaleString('ko-KR')}냥</span>
            <span className="park-account__separator" aria-hidden="true" />
            <span className="park-account__nickname">{parkView.nickname}</span>
            <span className="park-account__avatar"><img src={avatarImage} alt="내 캐릭터" /></span>
            <span className="park-chevron" aria-hidden="true" />
          </div>
          <button className="park-exit" type="button" onClick={onExit}>나가기</button>
          {exitError && <p className="park-exit-error" role="alert">{exitError}</p>}
        </div>

        <section className="park-chat" aria-label="주변 채팅">
          <div className="park-chat__messages">
            <h1>주변 채팅</h1>
            <div className="park-chat__list" ref={messageListRef} aria-live="polite">
              {messages.map((message) => (
                <p className="park-chat__message" key={message.id}>
                  <span className={message.own ? 'park-chat__author park-chat__author--own' : 'park-chat__author'}>{message.name}</span>
                  <span>{message.text}</span>
                </p>
              ))}
            </div>
          </div>
          {chatOpen ? (
            <form className="park-chat__composer park-chat__composer--open" onSubmit={(event) => { event.preventDefault(); void sendMessage() }}>
              <label className="visually-hidden" htmlFor="park-chat-input">주변 채팅 메시지</label>
              <input id="park-chat-input" ref={inputRef} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={handleInputKeyDown} placeholder="메시지를 입력하세요" maxLength={400} autoComplete="off" />
              <button type="submit" aria-label="메시지 보내기" disabled={session.pending || !session.roomId}>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
                  <path d="M4 12h15m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </form>
          ) : (
            <button className="park-chat__composer park-chat__composer--closed" type="button" onClick={() => setChatOpen(true)} aria-label="채팅 입력창 열기">
              <span>채팅 입력창 열기</span><kbd>Enter</kbd>
            </button>
          )}
        </section>

        <aside className="park-shortcuts" aria-label="조작 방법">
          {shortcuts.map(({ key, action }) => (
            <div className="park-shortcuts__item" key={key}><kbd>{key}</kbd><span>{action}</span></div>
          ))}
        </aside>
      </div>
      <ParkTools quality={quality} onQuality={changeQuality}/>
      <ParkInteractionHint />
      <EmoteWheel />
      <TelescopePanel />
      <FeedbackPanel />
      <AnonymousNotes />
      <BungeoppangHud />
      <ParkMap />
      <ParkNavigation />
      <ManualHost worldActions={<ManualWorldActions quality={quality} onQuality={changeQuality} onExit={onExit} />} />
    </main>
  )
}
