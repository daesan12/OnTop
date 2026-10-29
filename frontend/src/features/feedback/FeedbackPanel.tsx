import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { closeFeedback, submitFeedback } from './controller'
import { feedbackService } from './service'
import { editFeedbackDraft, useFeedbackState } from './state'
import { parseFeedbackText } from './validation'
import { inputState } from '../../world/inputOwnership'
import { FeedbackIcon } from './FeedbackIcon'
import { FEEDBACK_TOPICS, selectedFeedbackTopic, withFeedbackTopic, type FeedbackTopic } from './feedbackTopics'
import mailboxImage from './art/feedback-mailbox.webp'
import './feedback.css'

type LetterFlight = CSSProperties & { '--letter-x': string; '--letter-y': string }
const DELIVERY_MS = 2550
export function FeedbackPanel() {
  const open = useFeedbackState(s => s.open)
  return open ? <FeedbackComposer /> : null
}
function FeedbackComposer() {
  const state = useFeedbackState()
  const area = useRef<HTMLTextAreaElement>(null), dialog = useRef<HTMLElement>(null)
  const mouth = useRef<HTMLSpanElement>(null)
  const [now, setNow] = useState(Date.now)
  const [phase, setPhase] = useState<'writing' | 'folding' | 'delivered'>('writing')
  const [flight, setFlight] = useState<LetterFlight>()
  const sealed = phase !== 'writing'
  const selectedTopic = selectedFeedbackTopic(state.draft)
  useEffect(() => {
    if (sealed) dialog.current?.querySelector<HTMLButtonElement>('.feedback-close')?.focus({ preventScroll: true })
  }, [sealed])
  useEffect(() => {
    area.current?.focus({ preventScroll: true })
    const keys = (event: KeyboardEvent) => {
      if (inputState.manualOpen || event.code === 'F1') return
      if (event.isComposing || event.keyCode === 229) return
      if (event.code === 'Escape') { event.preventDefault(); closeFeedback() }
      if (event.code === 'Tab') {
        event.preventDefault()
        const controls = [...(dialog.current?.querySelectorAll<HTMLElement>('textarea:not(:disabled),button:not(:disabled)') ?? [])]
        const index = controls.indexOf(document.activeElement as HTMLElement)
        controls[(index + (event.shiftKey ? controls.length - 1 : 1)) % controls.length]?.focus()
      }
      event.stopImmediatePropagation()
    }
    window.addEventListener('keydown', keys, true)
    return () => window.removeEventListener('keydown', keys, true)
  }, [])
  useEffect(() => {
    if (state.nextAllowedAt <= Date.now()) return
    const timer = setInterval(() => {
      const time = Date.now()
      setNow(time)
      if (time >= state.nextAllowedAt) clearInterval(timer)
    }, 250)
    return () => clearInterval(timer)
  }, [state.nextAllowedAt])
  useEffect(() => {
    if (phase !== 'folding') return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const delivered = setTimeout(() => setPhase('delivered'), reduced ? 120 : DELIVERY_MS)
    return () => clearTimeout(delivered)
  }, [phase])
  useEffect(() => {
    if (phase !== 'delivered') return
    const timer = setTimeout(closeFeedback, 1400)
    return () => clearTimeout(timer)
  }, [phase])
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (sealed || state.pending) return
    const epoch = state.epoch
    const accepted = await submitFeedback()
    if (!accepted || !useFeedbackState.getState().open || useFeedbackState.getState().epoch !== epoch) return
    const paper = dialog.current?.getBoundingClientRect(), slot = mouth.current?.getBoundingClientRect()
    if (!paper || !slot) return
    const x = paper.left + paper.width / 2, y = paper.top + paper.height * .52
    setFlight({ left: x, top: y, '--letter-x': `${slot.left + slot.width / 2 - x}px`, '--letter-y': `${slot.top + slot.height / 2 - y}px` })
    setPhase('folding')
  }
  const chooseTopic = (topic: FeedbackTopic) => {
    const draft = withFeedbackTopic(state.draft, topic)
    if (draft === null) useFeedbackState.setState({ error: '주제도 600자에 포함돼요. 내용을 조금 줄인 뒤 선택해주세요.' })
    else editFeedbackDraft(draft)
  }
  const remaining = Math.max(0, Math.ceil((state.nextAllowedAt - now) / 1000))
  const retry = !!state.operationId && state.submittedText === parseFeedbackText(state.draft)
  return <div className="feedback-backdrop" data-feedback-phase={phase} onPointerDown={event => { if (event.target === event.currentTarget) closeFeedback() }}>
    <div className="feedback-stage">
      <aside className="feedback-mailbox-preview" aria-hidden="true">
        <div className="feedback-mailbox-image"><img src={mailboxImage} alt="" draggable={false}/><span ref={mouth} className="feedback-mailbox-mouth"/></div>
        <p>여러분의 목소리를<br/>들려주세요.</p>
      </aside>
      <section ref={dialog} className="feedback-dialog" role="dialog" aria-modal="true" aria-label="온탑 소리함" aria-describedby="feedback-description" data-feedback-dialog data-phase={phase}>
        <div className="feedback-roof" aria-hidden="true"/>
        <button type="button" className="feedback-close" aria-label="소리함 닫기" onClick={closeFeedback}>×</button>
        <div className="feedback-paper"><div className="feedback-paper-content" aria-hidden={sealed || undefined} inert={sealed || undefined}>
          <header className="feedback-heading">
            <h2><span className="feedback-brand"><FeedbackIcon kind="roof"/>온탑</span> 소리함</h2>
            <p className="feedback-intro">여러분의 소중한 의견이 더 좋은 온탑을 만듭니다.</p>
            <p id="feedback-description">게임에 대한 건의사항, 개선이 필요한 점, 버그 제보 등<br className="feedback-desktop-break"/> 어떤 의견이든 자유롭게 남겨주세요.</p>
          </header>
          <form onSubmit={event => { void submit(event) }}>
            <fieldset className="feedback-topics" disabled={state.pending || sealed}>
              <legend>의견 주제 <span>(선택)</span></legend>
              <div>{FEEDBACK_TOPICS.map(topic => <button key={topic.id} type="button" className={`feedback-topic feedback-topic--${topic.id}`} aria-pressed={selectedTopic === topic.id} onClick={() => chooseTopic(topic.id)}>
                <FeedbackIcon kind={topic.id}/><strong>{topic.label}</strong><small>{topic.detail}</small>{selectedTopic === topic.id && <span className="feedback-topic-check" aria-hidden="true">✓</span>}
              </button>)}</div>
            </fieldset>
            <label htmlFor="park-feedback-text">의견 내용</label>
            <textarea ref={area} id="park-feedback-text" value={state.draft} readOnly={state.pending} maxLength={600} rows={5}
              placeholder={'온탑을 더 재미있게 만들 수 있는 의견을 남겨주세요!\n(5~600자)'} onChange={event => editFeedbackDraft(event.target.value)} aria-describedby="feedback-length feedback-result"/>
            <div className="feedback-count" id="feedback-length">{state.draft.length}/600자 <span>· 5자 이상</span></div>
            <div className="feedback-privacy"><FeedbackIcon kind="lock"/><p>작성한 의견은 관리자만 확인할 수 있습니다.<br/>더 좋은 온탑을 만들기 위해 소중히 검토하겠습니다.</p></div>
            {feedbackService.mode === 'unavailable' && <p className="feedback-mode">서버 연결 준비 중입니다. 내용을 작성할 수 있지만 아직 전송할 수 없습니다.</p>}
            <div id="feedback-result" aria-live="polite">{state.pending && <p role="status">전달 결과를 기다리고 있어요. 확인되기 전에는 원문을 지우지 않습니다.</p>}{state.error && <p role="alert" className="feedback-error">{state.error}</p>}</div>
            <footer className="feedback-actions">
              <button type="button" className="feedback-cancel" onClick={closeFeedback}>취소</button>
              <button type="submit" className="feedback-send" disabled={state.pending || sealed || !parseFeedbackText(state.draft) || remaining > 0 || feedbackService.mode === 'unavailable'}>
                <FeedbackIcon kind="send"/>{state.pending ? '전달 중…' : remaining ? `${remaining}초 후 보내기` : retry ? '같은 의견 다시 보내기' : '의견 보내기'}
              </button>
            </footer>
          </form>
        </div></div>
        {sealed && <div className="feedback-delivery-status" role="status" aria-live="polite"><span>{phase === 'delivered' ? '소중한 마음, 잘 받았습니다.' : '마음을 편지에 담고 있어요.'}</span><p>{state.notice || '의견을 전달했어요. 고맙습니다!'}</p></div>}
      </section>
    </div>
    {phase === 'folding' && <div className="feedback-flying-letter" style={flight} aria-hidden="true"><i className="feedback-letter-back"/><i className="feedback-letter-wings"/><i className="feedback-letter-flap"/><b>온탑</b></div>}
  </div>
}
