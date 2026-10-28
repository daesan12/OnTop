import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { NOTES_BOX, type AnonymousNote } from '../../config/notes'
import { closeNotes, refreshNotes, submitNote, watchNotes } from './controller'
import { notesService } from './service'
import { editNoteDraft, editNoteTopic, useNotesState } from './state'
import { parseNoteText } from './validation'
import { NOTE_TOPICS, noteTopic, type NoteTopic } from './topics'
import { FountainPenInput } from './FountainPenInput'
import { inputState } from '../../world/inputOwnership'
import './notes.css'

const PAGE_SIZE = 12
type View = 'board' | 'compose' | 'folding' | 'success'
function StickyNote({ note, index = 0, fresh = false }: { note: AnonymousNote; index?: number; fresh?: boolean }) {
  const topic = noteTopic(note.category)
  return <article className={`sticky-note note-color-${note.category ?? index % 5}${fresh ? ' note-just-attached' : ''}`}
    style={{ '--note-paper': note.category ? topic.color : NOTE_TOPICS[index % 5]!.color, '--note-tilt': `${index % 2 ? 1.6 : -1.6}deg` } as CSSProperties}>
    <i className="notes-pin" aria-hidden="true"/><p tabIndex={note.text.length > 100 ? 0 : undefined}>{note.text}</p>
    <small>{topic.icon} {topic.label}<span>익명의 산책자</span></small>
  </article>
}
export function AnonymousNotes() {
  const open = useNotesState(s => s.open), epoch = useNotesState(s => s.epoch)
  return open ? <NotesVisit key={epoch}/> : null
}
function NotesVisit() {
  const state = useNotesState(), dialog = useRef<HTMLElement>(null)
  const [view, setView] = useState<View>('board'), [filter, setFilter] = useState<NoteTopic | 'all'>('all')
  const [page, setPage] = useState(0), [now, setNow] = useState(Date.now)
  const [posted, setPosted] = useState<AnonymousNote | null>(null)
  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      if (inputState.manualOpen || event.code === 'F1') return
      if (event.isComposing || event.keyCode === 229) return
      if (event.code === 'Escape') { event.preventDefault(); closeNotes() }
      if (event.code === 'Tab') {
        event.preventDefault()
        const controls = [...(dialog.current?.querySelectorAll<HTMLElement>('textarea,button:not(:disabled),[tabindex="0"]') ?? [])]
        const index = controls.indexOf(document.activeElement as HTMLElement)
        controls[(index + (event.shiftKey ? controls.length - 1 : 1)) % controls.length]?.focus()
      }
      event.stopImmediatePropagation()
    }
    window.addEventListener('keydown', keys, true)
    const stop = watchNotes()
    return () => { window.removeEventListener('keydown', keys, true); stop() }
  }, [])
  useEffect(() => {
    if (view === 'compose') dialog.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus({ preventScroll: true })
    else dialog.current?.focus({ preventScroll: true })
    if (view !== 'folding') return
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    const timer = setTimeout(() => setView('success'), reduced ? 80 : 1450)
    return () => clearTimeout(timer)
  }, [view])
  useEffect(() => {
    setNow(Date.now())
    const until = Math.max(state.nextAllowedAt, state.nextReadAt)
    if (until <= Date.now()) return
    const timer = setInterval(() => { setNow(Date.now()); if (Date.now() >= until) clearInterval(timer) }, 250)
    return () => clearInterval(timer)
  }, [state.nextAllowedAt, state.nextReadAt])
  const unavailable = notesService.mode === 'unavailable'
  const remaining = Math.max(0, Math.ceil((state.nextAllowedAt - now) / 1000))
  const retry = !!state.operationId && state.submittedText === parseNoteText(state.draft) && state.submittedTopic === state.draftTopic
  const filtered = state.notes.filter(n => filter === 'all' || (n.category ?? 'free') === filter)
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)), current = Math.min(page, pages - 1)
  const sending = async () => {
    const text = parseNoteText(state.draft), epoch = state.epoch
    if (!text || !await submitNote()) return
    const latest = useNotesState.getState()
    if (!latest.open || latest.epoch !== epoch) return
    setPosted(latest.notes.find(n => n.text === text) ?? null)
    setFilter('all'); setPage(0); setView('folding')
  }
  const board = view === 'board' || view === 'folding'
  return <div className="notes-backdrop" onPointerDown={event => { if (event.target === event.currentTarget) closeNotes() }}>
    <section ref={dialog} className={`notes-dialog ${board ? 'notes-board' : 'notes-paper'} notes-view-${view}`}
      role="dialog" aria-modal="true" aria-label="전망대 익명 메모" aria-describedby="notes-description" tabIndex={-1}>
      <button className="notes-close" type="button" aria-label="익명 메모 닫기" onClick={closeNotes}>×</button>
      {board ? <>
        <header className="notes-title"><small>전망대에서 나누는 작은 이야기</small><h2>온탑 메모함</h2>
          <p id="notes-description">여러분의 이야기가 모여,<br/>더 즐거운 온탑이 만들어져요.</p></header>
        <nav className="notes-filters" aria-label="메모 주제 필터">
          {(['all', 'cheer', 'daily', 'worry', 'recommend', 'free'] as const).map(id => <button key={id} type="button"
            aria-pressed={filter === id} onClick={() => { setFilter(id); setPage(0) }}>{id === 'all' ? '전체' : noteTopic(id).label}</button>)}
        </nav>
        <div className="notes-wall" role="region" aria-label="익명 메모 목록" aria-busy={state.loading}>
          {filtered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE).map((note, index) =>
            <StickyNote key={note.id} note={note} index={index} fresh={note.id === posted?.id && view === 'board'}/>)}
          {!filtered.length && <p className="notes-empty">{state.loading ? '마음 한 장을 불러오고 있어요…' : !state.loaded ? '메모를 불러오지 못했어요. 다시 불러와주세요.'
            : filter !== 'all' ? '아직 이 주제의 메모가 없어요.' : '아직 메모가 없어요. 첫 마음을 붙여주세요.'}</p>}
        </div>
        {state.readError && <p role="alert" className="notes-error">{state.readError}</p>}
        <footer className="notes-board-footer"><div className="notes-pagination" aria-label="메모 페이지">
          <button type="button" aria-label="이전 메모 페이지" disabled={current === 0} onClick={() => setPage(current - 1)}>‹</button>
          <span>{current + 1} / {pages}</span><button type="button" aria-label="다음 메모 페이지" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>›</button>
        </div><button type="button" className="notes-primary" onClick={() => setView('compose')} disabled={view === 'folding'}>✎ 메모 작성하기</button>
          <button className="notes-refresh" type="button" disabled={unavailable || state.loading || state.pending || now < state.nextReadAt}
            onClick={() => { void refreshNotes() }}>{state.loading ? '불러오는 중…' : '새로고침'}</button></footer>
        <p className="notes-caption">이름 없이 남긴 마음, 함께 읽어요.</p>
      </> : view === 'compose' ? <>
        <header className="notes-title"><small>온탑 메모함</small><h2>여기에 마음 한 장 남겨요</h2>
          <p id="notes-description">익명으로 누구나 볼 수 있는 메모예요.<br/>좋은 말, 응원, 일상, 고민 등 자유롭게 남겨주세요.</p></header>
        <form onSubmit={event => { event.preventDefault(); void sending() }}>
          <label className="notes-sr-only" htmlFor="anonymous-note-text">새 메모</label>
          <FountainPenInput value={state.draft} pending={state.pending} onChange={editNoteDraft}/>
          <div className="notes-counter" id="notes-length">{state.draft.length}/{NOTES_BOX.maxLength}</div>
          <fieldset className="notes-topics" disabled={state.pending || !notesService.supportsTopics}>
            <legend className="notes-sr-only">메모 주제 선택</legend>
            {NOTE_TOPICS.map(topic => <button key={topic.id} type="button" aria-pressed={state.draftTopic === topic.id}
              style={{ '--topic-paper': topic.color } as CSSProperties} onClick={() => editNoteTopic(topic.id)}><span aria-hidden="true">{topic.icon}</span>{topic.label}</button>)}
          </fieldset>
          {!notesService.supportsTopics && <p className="notes-caption">주제 선택은 준비 중이에요. 지금은 자유 메모로 남겨요.</p>}
          <div id="notes-result" aria-live="polite">
            {state.pending && <p role="status">메모를 붙이고 있어요…</p>}
            {state.error && <p role="alert" className="notes-error">{state.error}</p>}
          </div>
          <button className="notes-primary notes-submit" type="submit" disabled={unavailable || state.loading || state.pending || state.retryBlocked || !parseNoteText(state.draft) || remaining > 0}>
            {state.pending ? '붙이는 중…' : remaining ? `${remaining}초 후 붙이기` : retry ? '같은 메모 다시 붙이기' : '➤ 메모 남기기'}</button>
          <button className="notes-back" type="button" onClick={() => setView('board')}>‹ 메모함으로 돌아가기</button>
        </form>
      </> : <div className="notes-success">
        <header className="notes-title"><h2>메모가 등록되었어요!</h2><p id="notes-description">따뜻한 이야기를 나눠주셔서 감사합니다.<br/>여러 사람들과 함께 볼 수 있어요.</p></header>
        {posted && <StickyNote note={posted} fresh/>}
        <p role="status" className="notes-sr-only">{state.notice}</p>
        <button className="notes-primary" type="button" onClick={() => setView('board')}>메모함 보러가기</button>
      </div>}
      {view === 'folding' && posted && <div className="notes-fold-stage" role="status" aria-label="메모가 접혀 메모함에 붙고 있어요">
        <div className="notes-fold-paper" style={{ '--note-paper': noteTopic(posted.category).color } as CSSProperties}>
          <p>{posted.text}</p>
          <div className="notes-fold-flap" aria-hidden="true"><p>{posted.text}</p></div>
          <div className="notes-fold-bottom" aria-hidden="true"><p>{posted.text}</p></div>
          <i className="notes-arrival-pin"/>
        </div><span>마음 한 장, 메모함에 붙이는 중…</span>
      </div>}
    </section>
  </div>
}
