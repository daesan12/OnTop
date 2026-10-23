import { useEffect, useRef, useState } from 'react'
import { NOTES_BOX } from '../../config/notes'
import { closeNotes, refreshNotes, submitNote, watchNotes } from './controller'
import { notesService } from './service'
import { editNoteDraft, useNotesState } from './state'
import { parseNoteText } from './validation'
import './notes.css'

export function AnonymousNotes() {
  const state = useNotesState()
  const dialog = useRef<HTMLElement>(null), area = useRef<HTMLTextAreaElement>(null)
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!state.open) return
    area.current?.focus({ preventScroll: true })
    const keys = (event: KeyboardEvent) => {
      if (event.isComposing || event.keyCode === 229) return
      if (event.code === 'Escape') { event.preventDefault(); closeNotes() }
      if (event.code === 'Tab') {
        event.preventDefault()
        const controls = [...(dialog.current?.querySelectorAll<HTMLElement>('textarea,button:not(:disabled)') ?? [])]
        const index = controls.indexOf(document.activeElement as HTMLElement)
        controls[(index + (event.shiftKey ? controls.length - 1 : 1)) % controls.length]?.focus()
      }
      event.stopImmediatePropagation()
    }
    window.addEventListener('keydown', keys, true)
    const stop = watchNotes()
    return () => { window.removeEventListener('keydown', keys, true); stop() }
  }, [state.open])
  useEffect(() => {
    if (!state.open) return
    setNow(Date.now())
    const until = Math.max(state.nextAllowedAt, state.nextReadAt)
    if (until <= Date.now()) return
    const timer = setInterval(() => {
      setNow(Date.now())
      if (Date.now() >= until) clearInterval(timer)
    }, 250)
    return () => clearInterval(timer)
  }, [state.open, state.nextAllowedAt, state.nextReadAt])
  if (!state.open) return null
  const unavailable = notesService.mode === 'unavailable'
  const remaining = Math.max(0, Math.ceil((state.nextAllowedAt - now) / 1000))
  const retry = !!state.operationId && state.submittedText === parseNoteText(state.draft)
  return <div className="notes-backdrop" onPointerDown={event => { if (event.target === event.currentTarget) closeNotes() }}>
    <section ref={dialog} className="notes-dialog" role="dialog" aria-modal="true" aria-label="전망대 익명 메모" aria-describedby="notes-description">
      <button className="notes-close" type="button" aria-label="익명 메모 닫기" onClick={closeNotes}>×</button>
      <small>전망대 · 익명 메모</small>
      <h2>여기에 마음 한 장 남겨요</h2>
      <p id="notes-description">응원, 오늘의 기분, 하고 싶은 말. 이름 없이 메모함을 여는 이웃에게 보여요.</p>
      <p className="notes-mode">{unavailable ? '서버 연결 준비 중입니다. 아직 실제 메모를 조회하거나 게시할 수 없습니다.'
        : '개발 목업 · 현재 페이지에서만 공유합니다. 실제 사용자 간 전달·영구 저장은 하지 않습니다.'}</p>
      <div className="notes-heading">
        <strong>익명 메모 목록</strong>
        <button type="button" disabled={unavailable || state.loading || state.pending || now < state.nextReadAt}
          onClick={() => { void refreshNotes() }}>{state.loading ? '불러오는 중…' : '새로고침'}</button>
      </div>
      {state.readError && <p role="alert" className="notes-error">{state.readError} 새로고침으로 다시 시도해주세요.</p>}
      <div className="notes-wall" role="region" aria-label="익명 메모 목록" aria-busy={state.loading}>
        {state.notes.map((note, index) => <article key={note.id} className={`sticky-note note-color-${index % 4}`}>
          <p>{note.text}</p><small>익명의 산책자</small>
        </article>)}
        {!state.notes.length && <p className="notes-empty">{unavailable ? '서버 연결 후 메모를 확인할 수 있어요.'
          : state.loading ? '메모를 불러오고 있어요…' : state.loaded ? '아직 메모가 없어요. 첫 마음을 붙여주세요.' : '메모 목록을 불러와주세요.'}</p>}
      </div>
      <form onSubmit={event => { event.preventDefault(); void submitNote() }}>
        <label htmlFor="anonymous-note-text">새 메모</label>
        <textarea ref={area} id="anonymous-note-text" value={state.draft} readOnly={state.pending} maxLength={NOTES_BOX.maxLength}
          rows={3} placeholder="오늘도 잘하고 있어요!" onChange={event => editNoteDraft(event.target.value)} aria-describedby="notes-length notes-result" />
        <div className="notes-actions">
          <span id="notes-length">{state.draft.length}/{NOTES_BOX.maxLength}자 · 최근 {NOTES_BOX.capacity}장</span>
          <button type="submit" disabled={unavailable || state.loading || state.pending || !parseNoteText(state.draft) || remaining > 0}>
            {state.pending ? '붙이는 중…' : remaining ? `${remaining}초 후 붙이기` : retry ? '같은 메모 다시 붙이기' : '익명으로 붙이기'}
          </button>
        </div>
      </form>
      <div id="notes-result" aria-live="polite">
        {state.pending && <p role="status">게시 결과를 기다리고 있어요. 확인 전에는 원문을 지우지 않습니다.</p>}
        {state.error && <p role="alert" className="notes-error">{state.error}</p>}
        {state.notice && <p role="status">{state.notice}</p>}
      </div>
      <small>Esc 또는 ×로 닫습니다. 작성 중인 글은 현재 페이지에서만 보관합니다.</small>
    </section>
  </div>
}
