import { useCallback, useEffect, useRef, useState } from 'react'
import { AnnouncementError, deleteAnnouncement, listAnnouncements, saveAnnouncement, type Announcement, type AnnouncementDraft } from './api'
import './announcements.css'

const local = (value: string | null) => value ? new Date(Date.parse(value) - new Date(value).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''
const instant = (value: string) => value ? new Date(value).toISOString() : null
const empty = (): AnnouncementDraft => ({ title: '', text: '', published: false, displayOrder: 0, startsAt: null, endsAt: null, expectedVersion: 0 })

export function AdminAnnouncementsPage({ onAuthEnded }: { onAuthEnded: () => void }) {
  const [values, setValues] = useState<Announcement[]>([]), [draft, setDraft] = useState(empty)
  const [editing, setEditing] = useState<string | null>(null), [busy, setBusy] = useState(false), [ready, setReady] = useState(false)
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [removing, setRemoving] = useState<Announcement | null>(null)
  const createId = useRef(crypto.randomUUID()), abort = useRef(new AbortController()), pending = useRef(false), listSerial = useRef(0)
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
  async function save() {
    if (pending.current) return
    pending.current = true; setBusy(true); setError(''); setNotice('')
    let committed = false
    try {
      await saveAnnouncement(editing ?? createId.current, draft, !editing, abort.current.signal)
      if (abort.current.signal.aborted) return
      committed = true; reset(); setNotice('저장했어요. 게시 중인 공지는 공원에 최대 10초 안에 반영돼요.')
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
  return <section className="admin-feedback-content announcement-admin" aria-label="공지 관리">
    <p>표시 순서가 작은 공지부터 반복해요. 게시 기간은 선택 사항이며 현재 기기의 시간대로 입력해요.</p>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    <button disabled={busy} onClick={() => { setError(''); void refresh().catch(fail) }}>목록 다시 조회</button>
    <div className="announcement-admin-grid"><div>
      <h2>등록된 공지</h2>{!ready ? <p>공지 목록을 확인하고 있어요.</p> : !values.length ? <p>등록된 공지가 없어요.</p> : <ol>
        {values.map(value => <li key={value.id}><strong>{value.displayOrder}. {value.title}</strong><span>{value.published ? '게시 켜짐' : '게시 꺼짐'}</span>
          <p>{value.text}</p><small>{value.startsAt ? new Date(value.startsAt).toLocaleString() : '즉시'} ~ {value.endsAt ? new Date(value.endsAt).toLocaleString() : '종료 없음'}</small>
          <div><button disabled={busy} onClick={() => { setEditing(value.id); setDraft({ title: value.title, text: value.text, published: value.published, displayOrder: value.displayOrder, startsAt: value.startsAt, endsAt: value.endsAt, expectedVersion: value.version }); setRemoving(null); setError(''); setNotice('') }}>수정</button>
            <button disabled={busy} onClick={() => setRemoving(value)}>삭제</button></div>
        </li>)}</ol>}
      {removing && <div role="group" aria-label="공지 삭제 확인"><p>‘{removing.title}’ 공지를 삭제할까요?</p>
        <button disabled={busy} onClick={() => void remove()}>삭제 확정</button><button disabled={busy} onClick={() => setRemoving(null)}>취소</button></div>}
    </div><form onSubmit={e => { e.preventDefault(); void save() }}>
      <fieldset disabled={busy}><legend>{editing ? '공지 수정' : '새 공지'}</legend>
      <label>관리용 제목<input required maxLength={80} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })}/></label>
      <label>표시할 내용<textarea required maxLength={1000} rows={5} value={draft.text} onChange={e => setDraft({ ...draft, text: e.target.value })}/></label>
      <label>표시 순서<input required type="number" min={0} max={9999} value={draft.displayOrder} onChange={e => setDraft({ ...draft, displayOrder: e.target.valueAsNumber })}/></label>
      <label>게시 시작<input type="datetime-local" value={local(draft.startsAt)} onChange={e => setDraft({ ...draft, startsAt: instant(e.target.value) })}/></label>
      <label>게시 종료<input type="datetime-local" value={local(draft.endsAt)} min={local(draft.startsAt)} onChange={e => setDraft({ ...draft, endsAt: instant(e.target.value) })}/></label>
      <label><input type="checkbox" checked={draft.published} onChange={e => setDraft({ ...draft, published: e.target.checked })}/>게시 켜기</label>
      <button type="submit" disabled={busy || !ready || !draft.title.trim() || !draft.text.trim() || !Number.isSafeInteger(draft.displayOrder)
        || !!draft.startsAt && !!draft.endsAt && Date.parse(draft.endsAt) <= Date.parse(draft.startsAt)}>{busy ? '처리 중…' : '저장'}</button>
      <button type="button" disabled={busy} onClick={reset}>새 공지 / 취소</button>
      </fieldset>
    </form></div>
  </section>
}
