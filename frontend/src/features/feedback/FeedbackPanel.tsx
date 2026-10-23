import { useEffect, useRef, useState } from 'react'
import { closeFeedback, submitFeedback } from './controller'
import { feedbackService } from './service'
import { editFeedbackDraft, useFeedbackState } from './state'
import { parseFeedbackText } from './validation'
import './feedback.css'

export function FeedbackPanel() {
  const state = useFeedbackState()
  const area = useRef<HTMLTextAreaElement>(null), dialog = useRef<HTMLElement>(null)
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!state.open) return
    area.current?.focus({ preventScroll: true })
    const keys = (event: KeyboardEvent) => {
      if (event.isComposing || event.keyCode === 229) return
      if (event.code === 'Escape') { event.preventDefault(); closeFeedback() }
      if (event.code === 'Tab') {
        event.preventDefault()
        const controls = [...(dialog.current?.querySelectorAll<HTMLElement>('textarea,button:not(:disabled)') ?? [])]
        const index = controls.indexOf(document.activeElement as HTMLElement)
        controls[(index + (event.shiftKey ? controls.length - 1 : 1)) % controls.length]?.focus()
      }
      // Keep textarea defaults (including IME/newlines), but do not route keys to chat/roaming/G.
      event.stopImmediatePropagation()
    }
    window.addEventListener('keydown', keys, true)
    return () => window.removeEventListener('keydown', keys, true)
  }, [state.open])
  useEffect(() => {
    if (!state.open) return
    setNow(Date.now())
    if (state.nextAllowedAt <= Date.now()) return
    const timer = setInterval(() => {
      const time = Date.now()
      setNow(time)
      if (time >= state.nextAllowedAt) clearInterval(timer)
    }, 250)
    return () => clearInterval(timer)
  }, [state.open, state.nextAllowedAt])
  if (!state.open) return null
  const remaining = Math.max(0, Math.ceil((state.nextAllowedAt - now) / 1000))
  const retry = !!state.operationId && state.submittedText === parseFeedbackText(state.draft)
  return <div className="feedback-backdrop" onPointerDown={event => { if (event.target === event.currentTarget) closeFeedback() }}>
    <section ref={dialog} className="feedback-dialog" role="dialog" aria-modal="true" aria-label="온탑 소리함"
      aria-describedby="feedback-description" data-feedback-dialog>
      <button type="button" className="feedback-close" aria-label="소리함 닫기" onClick={closeFeedback}>×</button>
      <small className="feedback-kicker">온탑 · 지상 소리함</small>
      <h2>공원에 바라는 점을 들려주세요</h2>
      <p id="feedback-description">좋았던 점, 불편했던 점, 원하는 기능을 남겨주세요. 관리자에게만 전달하는 의견이며 다른 이용자에게 공개하지 않습니다.</p>
      <p className="feedback-mode">{feedbackService.mode === 'mock'
        ? '개발 목업 · 실제 관리자에게 전송하거나 영구 저장하지 않습니다.'
        : '서버 연결 준비 중입니다. 내용을 작성할 수 있지만 아직 전송할 수 없습니다.'}</p>
      <form onSubmit={event => { event.preventDefault(); void submitFeedback() }}>
        <label htmlFor="park-feedback-text">의견 내용</label>
        <textarea ref={area} id="park-feedback-text" value={state.draft} readOnly={state.pending} maxLength={600} rows={6}
          placeholder="공원에서 느낀 점을 적어주세요 (5~600자)" onChange={event => editFeedbackDraft(event.target.value)}
          aria-describedby="feedback-length feedback-result" />
        <div className="feedback-actions">
          <span id="feedback-length">{state.draft.length}/600자 · 5자 이상</span>
          <button type="submit" disabled={state.pending || !parseFeedbackText(state.draft) || remaining > 0 || feedbackService.mode === 'unavailable'}>
            {state.pending ? '전달 중…' : remaining ? `${remaining}초 후 보내기` : retry ? '같은 의견 다시 보내기' : '의견 보내기'}
          </button>
        </div>
      </form>
      <div id="feedback-result" aria-live="polite">
        {state.pending && <p role="status">전달 결과를 기다리고 있어요. 확인되기 전에는 원문을 지우지 않습니다.</p>}
        {state.error && <p role="alert" className="feedback-error">{state.error}</p>}
        {state.notice && <p role="status">{state.notice}</p>}
      </div>
      <small>Esc 또는 ×로 닫습니다. 닫아도 작성 내용은 현재 공원 접속에서 보관됩니다.</small>
    </section>
  </div>
}
