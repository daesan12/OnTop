import { useCallback, useEffect, useRef, useState } from 'react'
import { clearRoamingInput, focusParkCanvas } from '../../world/inputOwnership'
import { MenuDialog } from '../parkMenus/MenuDialog'
import { InboxError, loadNotifications, readNotification, statusLabels, type NotificationPage, type NotificationDetail } from './api'
import './notifications.css'

export function NotificationCenter({ hidden = false }: { hidden?: boolean }) {
  const [open, setOpen] = useState(false), [page, setPage] = useState<NotificationPage | null>(null)
  const [detail, setDetail] = useState<NotificationDetail | null>(null), [error, setError] = useState('')
  const [busy, setBusy] = useState(false), [filter, setFilter] = useState<'all' | 'unread' | 'reward'>('all')
  const [toast, setToast] = useState(''), [trail, setTrail] = useState([''])
  const listing = useRef<AbortController | null>(null), reading = useRef<AbortController | null>(null)
  const cursor = useRef(''), initial = useRef(true), unread = useRef(0)
  const load = useCallback(async (next = cursor.current, explicit = false) => {
    listing.current?.abort()
    const request = listing.current = new AbortController()
    try {
      const value = await loadNotifications(next, request.signal)
      if (request.signal.aborted) return
      if (!initial.current && value.unreadCount > unread.current) setToast('운영진에게 메시지가 도착했어요')
      initial.current = false; unread.current = value.unreadCount; cursor.current = next
      setPage(value); if (explicit) setError('')
    } catch (cause) {
      if (request.signal.aborted) return
      if (cause instanceof InboxError && cause.status === 401) { setPage(null); setDetail(null); setOpen(false) }
      if (explicit) setError(cause instanceof Error ? cause.message : '알림을 가져오지 못했어요.')
    }
  }, [])
  useEffect(() => {
    let stopped = false
    const refresh = () => { if (!stopped && !document.hidden) void load() }
    const timer = setInterval(refresh, 10000)
    // 소켓 이벤트에는 본문이 없으며 중복 수신은 재조회로 합쳐진다.
    let debounce: ReturnType<typeof setTimeout>
    const changed = () => { clearTimeout(debounce); debounce = setTimeout(refresh, 150) }
    queueMicrotask(refresh)
    window.addEventListener('ontop:notifications-changed', changed)
    document.addEventListener('visibilitychange', refresh)
    return () => { stopped = true; clearInterval(timer); clearTimeout(debounce); listing.current?.abort(); reading.current?.abort()
      window.removeEventListener('ontop:notifications-changed', changed); document.removeEventListener('visibilitychange', refresh) }
  }, [load])
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(''), 4500)
    return () => clearTimeout(timer)
  }, [toast])
  const close = useCallback(() => { reading.current?.abort(); setBusy(false); setOpen(false); setDetail(null); focusParkCanvas() }, [])
  useEffect(() => { if (hidden) close() }, [hidden, close])
  const show = async (id: string) => {
    reading.current?.abort()
    const request = reading.current = new AbortController()
    setBusy(true); setError('')
    try {
      const value = await readNotification(id, request.signal)
      if (request.signal.aborted) return
      setDetail(value); void load()
    } catch (cause) { if (!request.signal.aborted) setError(cause instanceof Error ? cause.message : '메시지를 확인하지 못했어요.') }
    finally { if (!request.signal.aborted) setBusy(false) }
  }
  const values = page?.items.filter(value => filter === 'all' || filter === 'unread' && value.readAt === null) ?? []
  return <>
    {!hidden && <button className="inbox-launcher" aria-label={`알림함${page?.unreadCount ? ` · 안 읽은 알림 ${page.unreadCount}개` : ''}`}
      onClick={() => { clearRoamingInput(); document.exitPointerLock?.(); setOpen(true); setDetail(null); setTrail(['']); void load('', true) }}>
      <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z"/><path d="M10 21h4"/></svg><span>알림</span>{!!page?.unreadCount && <b>{Math.min(99, page.unreadCount)}</b>}
    </button>}
    {!hidden && toast && !open && <div className="inbox-toast" role="status">✉ {toast}</div>}
    {open && !hidden && <MenuDialog label={detail ? '운영진 메시지' : '알림함'} className="inbox-dialog" backdropClassName="inbox-backdrop" onClose={close}>
      <header><span className="inbox-eyebrow">온탑 우편함</span><h2>{detail ? '운영진 메시지' : '알림함'}</h2>
        <button className="inbox-close" onClick={close} aria-label="알림함 닫기">×</button></header>
      {error && <div className="inbox-error" role="alert">{error} <button onClick={() => void load(cursor.current, true)}>다시 조회</button></div>}
      {busy && <p role="status">메시지를 열고 있어요…</p>}
      {detail ? <article className="inbox-letter">
        <span className="inbox-stamp">온탑 운영진</span><h3>보내주신 의견에 답변이 왔어요</h3>
        <time dateTime={detail.createdAt}>{new Date(detail.createdAt).toLocaleString('ko-KR')}</time>
        <p className="inbox-letter-body">{detail.body}</p>
        <aside><strong>내가 보낸 의견 · {statusLabels[detail.feedbackStatus]}</strong><p>{detail.feedbackText}</p></aside>
        <button className="inbox-primary" onClick={() => { setDetail(null); setError('') }}>목록으로</button>
      </article> : <>
        <nav className="inbox-tabs" aria-label="알림 종류">{([['all','전체'],['unread','안 읽음'],['reward','보상']] as const).map(([key,label]) =>
          <button key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>)}</nav>
        <p className="inbox-subtitle">안 읽은 소식 {page?.unreadCount ?? 0}개 · {trail.length}페이지</p>
        <div className="inbox-list">{values.map(value => <button key={value.id} className={`inbox-row ${value.readAt ? 'is-read' : 'is-new'}`}
          disabled={busy} onClick={() => void show(value.id)}>
          <span className="inbox-envelope" aria-hidden="true">✉</span><span><strong>{value.title}</strong>
            <small>보내주신 소리함 의견에 답변을 남겼습니다.</small><time dateTime={value.createdAt}>{new Date(value.createdAt).toLocaleString('ko-KR')}</time></span>
          <span className="inbox-row-arrow" aria-hidden="true">›</span></button>)}</div>
        {values.length === 0 && <p className="inbox-empty">{!page ? '알림을 확인하고 있어요.' : filter === 'reward' ? '아직 도착한 보상이 없어요.'
          : filter === 'unread' ? '이 페이지에 안 읽은 알림이 없어요.' : '아직 도착한 소식이 없어요.'}</p>}
        <footer><button disabled={trail.length < 2 || busy} onClick={() => { const next = trail.slice(0,-1); setTrail(next); void load(next.at(-1)!, true) }}>이전</button>
          <button onClick={() => void load(cursor.current, true)}>새로고침</button>
          <button disabled={!page?.nextCursor || busy} onClick={() => { if (page?.nextCursor) { setTrail([...trail,page.nextCursor]); void load(page.nextCursor,true) } }}>다음</button></footer>
        <p className="inbox-footnote">읽은 메시지도 여기서 다시 확인할 수 있어요.</p>
      </>}
    </MenuDialog>}
  </>
}
