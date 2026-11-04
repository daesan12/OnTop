import { useCallback, useEffect, useRef, useState } from 'react'
import { AnnouncementError, deleteAnnouncement, listAnnouncements, saveAnnouncement, type Announcement, type AnnouncementDraft } from './api'
import './announcements.css'

const local = (value: string | null) => value ? new Date(Date.parse(value) - new Date(value).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''
const instant = (value: string) => value ? new Date(value).toISOString() : null
const empty = (): AnnouncementDraft => ({ title: '', text: '', published: true, displayOrder: 0, startsAt: null, endsAt: null, expectedVersion: 0 })
const editable = (value: Announcement): AnnouncementDraft => ({ title: value.title, text: value.text, published: value.published, displayOrder: value.displayOrder, startsAt: value.startsAt, endsAt: value.endsAt, expectedVersion: value.version })
const stateLabel = (value: Announcement) => !value.published ? '숨김' : value.endsAt && Date.parse(value.endsAt) <= Date.now() ? '게시 종료' : value.startsAt && Date.parse(value.startsAt) > Date.now() ? '예약' : '게시 중'

export function AdminAnnouncementsPage({ onAuthEnded }: { onAuthEnded: () => void }) {
  const [values, setValues] = useState<Announcement[]>([]), [draft, setDraft] = useState(empty)
  const [editing, setEditing] = useState<string | null>(null), [busy, setBusy] = useState(false), [ready, setReady] = useState(false)
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [removing, setRemoving] = useState<Announcement | null>(null)
  const createId = useRef(crypto.randomUUID()), abort = useRef(new AbortController()), pending = useRef(false), listSerial = useRef(0)
  const composer = useRef<HTMLTextAreaElement>(null)
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
    if (pending.current) return
    pending.current = true; setBusy(true); setError(''); setNotice('')
    let committed = false
    try {
      const body = { ...value, title: value.title.trim() || value.text.trim().replace(/\s+/g, ' ').slice(0, 30) }
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
    if (!removing || pending.current) return
    pending.current = true; setBusy(true); setError('')
    try { await deleteAnnouncement(removing, abort.current.signal); if (abort.current.signal.aborted) return; reset(); await refresh(); setNotice('공지를 삭제했어요.') }
    catch (cause) { fail(cause) }
    finally { pending.current = false; if (!abort.current.signal.aborted) setBusy(false) }
  }
  function edit(value: Announcement) {
    setEditing(value.id); setDraft(editable(value)); setRemoving(null); setError(''); setNotice('')
    composer.current?.focus(); composer.current?.scrollIntoView({ block: 'center' })
  }
  const invalidPeriod = !!draft.startsAt && !!draft.endsAt && Date.parse(draft.endsAt) <= Date.parse(draft.startsAt)
  return <section className="admin-feedback-content announcement-admin" aria-label="공지 관리">
    {error && <p className="announcement-feedback is-error" role="alert">{error}</p>}
    {notice && <p className="announcement-feedback" role="status">{notice}</p>}
    <div className="announcement-admin-grid">
      <form className="announcement-composer" onSubmit={e => { e.preventDefault(); void save() }}>
        <fieldset disabled={busy || !ready}><legend>{editing ? '공지 수정하기' : '새 소식 전하기'}</legend>
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
          <details className="announcement-options"><summary>추가 설정 <span>예약 · 종료 · 순서</span></summary>
            <label>관리용 제목 <small>비워두면 내용으로 자동 생성해요.</small><input maxLength={80} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })}/></label>
            <div className="announcement-dates"><label>게시 시작<input type="datetime-local" value={local(draft.startsAt)} onChange={e => setDraft({ ...draft, startsAt: instant(e.target.value) })}/></label>
              <label>게시 종료<input type="datetime-local" value={local(draft.endsAt)} min={local(draft.startsAt)} onChange={e => setDraft({ ...draft, endsAt: instant(e.target.value) })}/></label></div>
            <small>기간을 비워두면 바로 게시하고, 숨길 때까지 유지해요. 시간은 현재 기기 기준이에요.</small>
            <label>표시 순서 <small>작은 숫자부터 보여요.</small><input required type="number" min={0} max={9999} value={draft.displayOrder} onChange={e => setDraft({ ...draft, displayOrder: e.target.valueAsNumber })}/></label>
            <label className="announcement-check"><input type="checkbox" checked={draft.published} onChange={e => setDraft({ ...draft, published: e.target.checked })}/>공원에 게시하기</label>
          </details>
        </fieldset>
      </form>
      <div className="announcement-list"><header><div><h2>등록된 공지 <span>{values.length}</span></h2><p>수정하거나 잠시 숨길 수 있어요.</p></div>
        <button className="announcement-refresh" disabled={busy} onClick={() => { setError(''); void refresh().catch(fail) }}>새로고침</button></header>
        {!ready ? <p className="announcement-empty">공지 목록을 확인하고 있어요.</p> : !values.length ? <div className="announcement-empty"><strong>아직 등록된 공지가 없어요.</strong><p>왼쪽에 첫 소식을 적어보세요.</p></div> : <ol>
          {values.map(value => <li key={value.id} data-editing={editing === value.id}>
            <div className="announcement-entry-heading"><span className="announcement-state" data-state={stateLabel(value)}>{stateLabel(value)}</span><strong>{value.title}</strong></div>
            <p>{value.text}</p>
            {(value.startsAt || value.endsAt) && <small>{value.startsAt ? new Date(value.startsAt).toLocaleString() : '즉시'} ~ {value.endsAt ? new Date(value.endsAt).toLocaleString() : '종료 없음'}</small>}
            <div className="announcement-entry-actions"><button disabled={busy} onClick={() => edit(value)}>수정</button>
              <button disabled={busy || editing !== null} title={editing ? '수정을 저장하거나 취소한 뒤 변경해주세요.' : undefined} onClick={() => void save({ ...editable(value), published: !value.published }, value.id)}>{value.published ? '숨기기' : '게시하기'}</button>
              <button className="announcement-delete" disabled={busy} onClick={() => setRemoving(value)}>삭제</button></div>
            {removing?.id === value.id && <div className="announcement-delete-confirm" role="group" aria-label="공지 삭제 확인"><p>이 공지를 삭제할까요? 삭제하면 되돌릴 수 없어요.</p>
              <button disabled={busy} onClick={() => void remove()}>삭제 확정</button><button disabled={busy} onClick={() => setRemoving(null)}>취소</button></div>}
          </li>)}</ol>}
      </div>
    </div>
  </section>
}
