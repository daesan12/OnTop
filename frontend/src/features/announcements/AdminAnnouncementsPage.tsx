import { AdminEntryNewsPage } from './AdminEntryNewsPage'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AnnouncementError, deleteAnnouncement, listAnnouncements, reorderAnnouncements, saveAnnouncement, type Announcement, type AnnouncementDraft } from './api'
import './announcements.css'

const local = (value: string | null) => value ? new Date(Date.parse(value) - new Date(value).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''
const instant = (value: string) => value ? new Date(value).toISOString() : null
const empty = (): AnnouncementDraft => ({ title: '', text: '', published: true, displayOrder: 0, startsAt: null, endsAt: null, expectedVersion: 0 })
const editable = (value: Announcement): AnnouncementDraft => ({ title: value.title, text: value.text, published: value.published, displayOrder: value.displayOrder, startsAt: value.startsAt, endsAt: value.endsAt, expectedVersion: value.version })
const stateLabel = (value: Announcement, now = Date.now()) => !value.published ? '숨김' : value.endsAt && Date.parse(value.endsAt) <= now ? '게시 종료' : value.startsAt && Date.parse(value.startsAt) > now ? '예약' : '게시 중'

function TextAnnouncementsPage({ onAuthEnded }: { onAuthEnded: () => void }) {
  const [values, setValues] = useState<Announcement[]>([]), [draft, setDraft] = useState(empty)
  const [editing, setEditing] = useState<string | null>(null), [busy, setBusy] = useState(false), [ready, setReady] = useState(false)
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [removing, setRemoving] = useState<Announcement | null>(null)
  const createId = useRef(crypto.randomUUID()), abort = useRef(new AbortController()), pending = useRef(false), listSerial = useRef(0)
  const composer = useRef<HTMLTextAreaElement>(null)
  const [view, setView] = useState<'all' | 'live' | 'history'>('all'), [query, setQuery] = useState('')
  const [order, setOrder] = useState<string[] | null>(null), [dragging, setDragging] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer) }, [])
  const fail = useCallback((cause: unknown) => {
    if (abort.current.signal.aborted) return
    if (cause instanceof AnnouncementError && cause.status === 401) { onAuthEnded(); return }
    setError(cause instanceof Error ? cause.message : '공지를 처리하지 못했어요. 다시 확인해주세요.')
  }, [onAuthEnded])
  const refresh = useCallback(async () => {
    const serial = ++listSerial.current
    try {
      const values = await listAnnouncements(abort.current.signal)
      if (!abort.current.signal.aborted && serial === listSerial.current) { setValues(values); setReady(true) }
    } catch (cause) { if (serial === listSerial.current) throw cause }
  }, [])
  useEffect(() => {
    const controller = new AbortController(); abort.current = controller
    void refresh().catch(fail)
    return () => controller.abort()
  }, [refresh, fail])
  function reset() { setDraft(empty()); setEditing(null); createId.current = crypto.randomUUID(); setRemoving(null) }
  async function save(value = draft, target = editing) {
    if (pending.current || order) return
    pending.current = true; setBusy(true); setError(''); setNotice('')
    let committed = false
    try {
      const body = { ...value, ...(!target ? { displayOrder: Math.min(9999, Math.max(-1, ...values.map(item => item.displayOrder)) + 1) } : {}), title: value.title.trim() || value.text.trim().replace(/\s+/g, ' ').slice(0, 30) }
      await saveAnnouncement(target ?? createId.current, body, !target, abort.current.signal)
      if (abort.current.signal.aborted) return
      committed = true; if (target === editing) reset(); setNotice(value.published ? '공지를 올렸어요. 공원에는 최대 10초 안에 반영돼요.' : '공지를 숨겼어요.')
      await refresh()
    } catch (cause) {
      if (committed) setNotice('저장은 완료됐어요. 목록 조회만 다시 시도해주세요.')
      fail(cause)
    } finally { pending.current = false; if (!abort.current.signal.aborted) setBusy(false) }
  }
  async function remove() {
    if (!removing || pending.current || order) return
    pending.current = true; setBusy(true); setError('')
    try { await deleteAnnouncement(removing, abort.current.signal); if (abort.current.signal.aborted) return; reset(); await refresh(); setNotice('공지를 삭제했어요.') }
    catch (cause) { fail(cause) }
    finally { pending.current = false; if (!abort.current.signal.aborted) setBusy(false) }
  }
  function edit(value: Announcement) {
    setEditing(value.id); setDraft(editable(value)); setRemoving(null); setError(''); setNotice('')
    composer.current?.focus(); composer.current?.scrollIntoView({ block: 'center' })
  }
  const ordered = order ? order.map(id => values.find(value => value.id === id)!).filter(Boolean) : values
  const past = (value: Announcement) => !value.published || !!value.endsAt && Date.parse(value.endsAt) <= now
  const filtered = ordered.filter(value => (view === 'all' || (view === 'history' ? past(value) : !past(value)))
    && (value.title + '\n' + value.text).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const canReorder = !busy && !editing && view === 'all' && !query.trim()
  function move(id: string, target: string) {
    if (!canReorder || id === target) return
    const next = ordered.map(value => value.id), from = next.indexOf(id), to = next.indexOf(target)
    if (from < 0 || to < 0) return
    next.splice(from, 1); next.splice(to, 0, id)
    setOrder(next.every((id, i) => id === values[i]?.id) ? null : next)
    setDragging(null); setRemoving(null); setError(''); setNotice('')
  }
  async function saveOrder() {
    if (!order || pending.current) return
    pending.current = true; setBusy(true); setError(''); setNotice('')
    let committed = false
    try {
      await reorderAnnouncements(ordered, abort.current.signal)
      if (abort.current.signal.aborted) return
      committed = true; setOrder(null); await refresh(); setNotice('표시 순서를 저장했어요. 공원에는 최대 10초 안에 반영돼요.')
    } catch (cause) {
      if (committed) setNotice('순서는 저장했어요. 목록 조회만 다시 시도해주세요.')
      fail(cause)
    } finally { pending.current = false; if (!abort.current.signal.aborted) setBusy(false) }
  }
  const invalidPeriod = !!draft.startsAt && !!draft.endsAt && Date.parse(draft.endsAt) <= Date.parse(draft.startsAt)
  return <section className="admin-feedback-content announcement-admin" aria-label="공지 관리">
    {error && <p className="announcement-feedback is-error" role="alert">{error}</p>}
    {notice && <p className="announcement-feedback" role="status">{notice}</p>}
    <div className="announcement-admin-grid">
      <form className="announcement-composer" onSubmit={e => { e.preventDefault(); void save() }}>
        <fieldset disabled={busy || !ready || order !== null}><legend>{editing ? '공지 수정하기' : '새 소식 전하기'}</legend>
          <p className="announcement-help">내용만 적으면 바로 올릴 수 있어요.</p>
          <label htmlFor="notice-text">공지 내용</label>
          <textarea id="notice-text" ref={composer} required maxLength={1000} rows={4} placeholder="공원에 전할 소식을 적어주세요."
            value={draft.text} onChange={e => setDraft({ ...draft, text: e.target.value })}/>
          <div className="announcement-text-meta"><span>공원 맨 위에서 흐르는 문구예요.</span><span>{draft.text.length} / 1,000</span></div>
          <div className="announcement-preview" aria-label="공원 표시 미리보기"><strong>공지</strong><span>{draft.text || '여기에 공지 내용이 표시돼요.'}</span></div>
          {invalidPeriod && <p role="alert">게시 종료를 시작보다 늦게 정해주세요.</p>}
          <div className="announcement-form-actions"><button className="announcement-primary" type="submit" disabled={busy || !ready || !draft.text.trim() || !Number.isSafeInteger(draft.displayOrder) || invalidPeriod}>
            {busy ? '저장 중…' : editing ? '수정 저장' : draft.published ? '공지 올리기' : '숨김으로 저장'}</button>
            {editing && <button type="button" onClick={reset}>수정 취소</button>}</div>
          <details className="announcement-options"><summary>추가 설정 <span>예약 · 종료</span></summary>
            <label>관리용 제목 <small>비워두면 내용으로 자동 생성해요.</small><input maxLength={80} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })}/></label>
            <div className="announcement-dates"><label>게시 시작<input type="datetime-local" value={local(draft.startsAt)} onChange={e => setDraft({ ...draft, startsAt: instant(e.target.value) })}/></label>
              <label>게시 종료<input type="datetime-local" value={local(draft.endsAt)} min={local(draft.startsAt)} onChange={e => setDraft({ ...draft, endsAt: instant(e.target.value) })}/></label></div>
            <small>기간을 비워두면 바로 게시하고, 숨길 때까지 유지해요. 시간은 현재 기기 기준이에요.</small>
            <label className="announcement-check"><input type="checkbox" checked={draft.published} onChange={e => setDraft({ ...draft, published: e.target.checked })}/>공원에 게시하기</label>
          </details>
        </fieldset>
      </form>
      <div className="announcement-list"><header><div><h2>등록된 공지 <span>{values.length}</span></h2><p>카드를 옮겨 순서를 정하고 지난 소식도 찾아보세요.</p></div>
        <button className="announcement-refresh" disabled={busy} onClick={() => { setOrder(null); setDragging(null); setError(''); void refresh().catch(fail) }}>새로고침</button></header>
        <div className="announcement-tabs" role="group" aria-label="공지 분류">
          {([['all', '전체'], ['live', '게시·예약'], ['history', '지난 공지']] as const).map(([key, text]) => <button key={key} disabled={busy || order !== null} aria-pressed={view === key} onClick={() => setView(key)}>{text} <span>{key === 'all' ? values.length : values.filter(value => key === 'history' ? past(value) : !past(value)).length}</span></button>)}
        </div>
        <label className="announcement-search">공지 검색<input type="search" placeholder="제목이나 내용으로 찾기" disabled={busy || order !== null} value={query} onChange={e => setQuery(e.target.value)}/></label>
        {order ? <div className="announcement-order-actions" role="group" aria-label="표시 순서 저장"><span>순서가 바뀌었어요.</span><button className="announcement-primary" disabled={busy} onClick={() => void saveOrder()}>순서 저장</button><button disabled={busy} onClick={() => { setOrder(null); setDragging(null) }}>되돌리기</button></div>
          : <p className="announcement-order-help">{view === 'history' ? '게시가 끝났거나 숨긴 공지를 보관해요. 삭제한 공지는 제외돼요.' : editing ? '수정을 저장하거나 취소한 뒤 순서를 바꿀 수 있어요.' : canReorder ? '손잡이를 드래그하거나 ↑ ↓ 버튼으로 옮기세요.' : '순서 변경은 검색을 비운 전체 목록에서 가능해요.'}</p>}
        {!ready ? <p className="announcement-empty">공지 목록을 확인하고 있어요.</p> : !values.length ? <div className="announcement-empty"><strong>아직 등록된 공지가 없어요.</strong><p>왼쪽에 첫 소식을 적어보세요.</p></div> : !filtered.length ? <p className="announcement-empty">해당하는 공지가 없어요.</p> : <ol aria-label="공지 카드 목록">
          {filtered.map((value, index) => <li key={value.id} data-editing={editing === value.id} data-dragging={dragging === value.id}
            onDragOver={event => { if (canReorder && dragging) event.preventDefault() }}
            onDrop={event => { event.preventDefault(); if (dragging) move(dragging, value.id) }}>
            {view === 'all' && !query.trim() && <div className="announcement-card-order"><button className="announcement-drag-handle" draggable={canReorder}
              disabled={!canReorder} aria-label={value.title + ' 순서 드래그'} title="끌어서 순서 변경"
              onDragStart={event => { setDragging(value.id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', value.id) }} onDragEnd={() => setDragging(null)}>⠿</button>
              <span>{view === 'all' && !query.trim() ? index + 1 : ''}</span>
              <button disabled={!canReorder || index === 0} aria-label={value.title + ' 위로 이동'} onClick={() => move(value.id, ordered[index - 1].id)}>↑</button>
              <button disabled={!canReorder || index === ordered.length - 1} aria-label={value.title + ' 아래로 이동'} onClick={() => move(value.id, ordered[index + 1].id)}>↓</button></div>}
            <div className="announcement-entry-heading"><span className="announcement-state" data-state={stateLabel(value, now)}>{stateLabel(value, now)}</span><strong>{value.title}</strong></div>
            <p>{value.text}</p>
            <small>마지막 수정 {new Date(value.updatedAt).toLocaleString()}</small>
            {(value.startsAt || value.endsAt) && <small>{value.startsAt ? new Date(value.startsAt).toLocaleString() : '즉시'} ~ {value.endsAt ? new Date(value.endsAt).toLocaleString() : '종료 없음'}</small>}
            <div className="announcement-entry-actions"><button disabled={busy || order !== null} onClick={() => edit(value)}>수정</button>
              <button disabled={busy || editing !== null || order !== null} title={editing ? '수정을 저장하거나 취소한 뒤 변경해주세요.' : undefined} onClick={() => void save({ ...editable(value), published: !value.published }, value.id)}>{value.published ? '숨기기' : '게시하기'}</button>
              <button className="announcement-delete" disabled={busy || order !== null} onClick={() => setRemoving(value)}>삭제</button></div>
            {removing?.id === value.id && <div className="announcement-delete-confirm" role="group" aria-label="공지 삭제 확인"><p>이 공지를 삭제할까요? 삭제하면 되돌릴 수 없어요.</p>
              <button disabled={busy} onClick={() => void remove()}>삭제 확정</button><button disabled={busy} onClick={() => setRemoving(null)}>취소</button></div>}
          </li>)}</ol>}
      </div>
    </div>
  </section>
}

export function AdminAnnouncementsPage({onAuthEnded}:{onAuthEnded:()=>void}) {
 const [tab,setTab]=useState<'banner'|'entry'>('banner')
 return <><nav aria-label="공지 종류" style={{display:'flex',gap:12,marginBottom:28}}><button type="button" aria-pressed={tab==='banner'} onClick={()=>setTab('banner')}>상단 흐르는 공지</button><button type="button" aria-pressed={tab==='entry'} onClick={()=>setTab('entry')}>접속 안내 팝업</button></nav>{tab==='entry'?<AdminEntryNewsPage onAuthEnded={onAuthEnded}/>:<TextAnnouncementsPage onAuthEnded={onAuthEnded}/>}</>
}