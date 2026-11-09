import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { clearRoamingInput, focusParkCanvas } from '../../world/inputOwnership'
import { MenuDialog } from '../parkMenus/MenuDialog'
import { InboxError, loadNotifications, readNotification, statusLabels, type NotificationPage, type NotificationDetail } from './api'
import { claimReward, rewardLabel, type RewardReceipt, type NotificationItem } from './api'
import { refreshWalletAfterSettlement } from '../wallet/settlementRefresh'
import { useSession } from '../../network/worldClient'
import coinArt from '../../assets/entry/yeopjeon-icon.webp'
import './notifications.css'

export function NotificationCenter({ hidden = false, onOpenWinnings }: { hidden?: boolean; onOpenWinnings?: (week: string) => void }) {
  const [open, setOpen] = useState(false), [page, setPage] = useState<NotificationPage | null>(null)
  const [detail, setDetail] = useState<NotificationDetail | null>(null), [error, setError] = useState('')
  const [busy, setBusy] = useState(false), [filter, setFilter] = useState<'all' | 'unread' | 'reward'>('all')
  const [toast, setToast] = useState(''), [trail, setTrail] = useState([''])
  const [hudHost, setHudHost] = useState<HTMLElement | null>(null)
  const [closing, setClosing] = useState(false)
  const [receipt, setReceipt] = useState<RewardReceipt | null>(null)
  const claimPending = useRef(false), confirm = useRef<HTMLButtonElement | null>(null)
  const confirmed = useRef(new Set<string>())
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const listing = useRef<AbortController | null>(null), reading = useRef<AbortController | null>(null)
  const cursor = useRef(''), initial = useRef(true), unread = useRef(0)
  const load = useCallback(async (next = cursor.current, explicit = false) => {
    listing.current?.abort()
    const request = listing.current = new AbortController()
    try {
      const value = await loadNotifications(next, request.signal)
      if (request.signal.aborted) return
      // 수령은 커밋됐지만 응답을 잃었거나 창을 닫은 경우도 권위 잔액을 다시 읽는다.
      for (const entry of value.items) {
        if (!entry.reward?.claimedAt || confirmed.current.has(entry.id)) continue
        confirmed.current.add(entry.id)
        if (confirmed.current.size > 128) confirmed.current.delete(confirmed.current.values().next().value!)
        if (entry.reward.kind === 'COIN') refreshWalletAfterSettlement(useSession.getState().sessionId, `notification:${entry.id}`)
        else window.dispatchEvent(new Event('ontop:gacha-inventory-changed'))
      }
      if (!initial.current && value.unreadCount > unread.current) setToast('새 알림이 도착했어요')
      initial.current = false; unread.current = value.unreadCount; cursor.current = next
      setPage(value); if (explicit) setError('')
    } catch (cause) {
      if (request.signal.aborted) return
      if (cause instanceof InboxError && cause.status === 401) { setPage(null); setDetail(null); setOpen(false) }
      if (explicit) setError(cause instanceof Error ? cause.message : '알림을 가져오지 못했어요.')
    }
  }, [])
  // 프로필과 같은 배치·축척을 따른다. 공지/화면 크기에 따른 프로필 이동도 함께 반영된다.
  useEffect(() => { setHudHost(hidden ? null : document.querySelector<HTMLElement>('.park-account')) }, [hidden])
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
    const timer = setTimeout(() => setToast(''), 5000)
    return () => clearTimeout(timer)
  }, [toast])
  const close = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = null
    reading.current?.abort(); setBusy(false); setClosing(false); setOpen(false); setDetail(null); setReceipt(null); focusParkCanvas()
  }, [])
  const fold = useCallback(() => {
    if (closeTimer.current) return
    reading.current?.abort(); setBusy(false)
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { close(); return }
    setClosing(true)
    // CSS의 420ms 접기가 끝난 뒤 포커스 소유권을 공원으로 돌린다.
    closeTimer.current = setTimeout(close, 440)
  }, [close])
  useEffect(() => {
    if (!open) {
      if (closeTimer.current) clearTimeout(closeTimer.current)
      closeTimer.current = null; setClosing(false)
    }
    return () => { if (closeTimer.current) clearTimeout(closeTimer.current) }
  }, [open])
  useEffect(() => { if (hidden) close() }, [hidden, close])
  useEffect(() => { if (receipt) confirm.current?.focus({ preventScroll: true }) }, [receipt])
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
  const claim = async (value: NotificationItem) => {
    if (claimPending.current || !value.reward) return
    claimPending.current = true; setBusy(true); setError('')
    reading.current?.abort()
    const request = reading.current = new AbortController()
    try {
      const result = await claimReward(value.id, request.signal)
      if (request.signal.aborted) return
      if (result.kind !== value.reward.kind || result.amount !== value.reward.amount) throw new InboxError('수령 내용을 다시 확인해주세요.')
      setReceipt(result)
      // 서버가 확정한 잔액을 재조회한다. 화면에서 보상액을 직접 더하지 않는다.
      if (result.kind === 'COIN') refreshWalletAfterSettlement(useSession.getState().sessionId, `notification:${value.id}`)
      window.dispatchEvent(new Event('ontop:gacha-inventory-changed'))
      void load()
    } catch (cause) {
      if (!request.signal.aborted) setError(cause instanceof Error ? cause.message : '같은 보상으로 다시 확인해주세요.')
    } finally { claimPending.current = false; if (!request.signal.aborted) setBusy(false) }
  }
  const openWinnings = () => {
    if (!detail?.event || !onOpenWinnings) return
    const week = detail.event.weekStartDate
    reading.current?.abort()
    setDetail(null); setOpen(false); setClosing(false); setError('')
    onOpenWinnings(week)
  }
  const values = page?.items.filter(value => filter === 'all' || filter === 'reward' && value.type === 'REWARD'
    || filter === 'unread' && value.readAt === null) ?? []
  const launcher = <div className="inbox-hud">
    <button className="inbox-launcher" aria-expanded={open} aria-label={`알림함${page?.unreadCount ? ` · 안 읽은 알림 ${page.unreadCount}개` : ''}`}
      onClick={() => { clearRoamingInput(); document.exitPointerLock?.(); setToast(''); setOpen(true); setDetail(null); setTrail(['']); void load('', true) }}>
      <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z"/><path d="M10 21h4"/></svg><span>알림</span>{!!page?.unreadCount && <b>{Math.min(99, page.unreadCount)}</b>}
    </button>
    {toast && !open && <div className="inbox-toast" role="status"><span className="inbox-toast-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/></svg></span><span className="inbox-toast-copy"><strong>{toast}</strong><small>알림함에서 확인해 주세요</small></span></div>}
  </div>
  return <>
    {!hidden && (hudHost ? createPortal(launcher, hudHost) : launcher)}
    {open && !hidden && <MenuDialog label={receipt ? '보상 수령 완료' : detail?.type === 'EVENT_WINNER' ? '당첨 알림' : detail ? '운영진 메시지' : '알림함'} className={`inbox-dialog${closing ? ' is-closing' : ''}${receipt ? ' has-reward' : ''}`} backdropClassName={`inbox-backdrop${closing ? ' is-closing' : ''}`} onClose={receipt ? () => setReceipt(null) : fold}>
      <div className="inbox-scroll-content" inert={closing || !!receipt}>
      <button className="inbox-close" onClick={fold} aria-label="알림함 닫기"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
      <header><span className="inbox-eyebrow">온탑 우편함</span><h2>{detail?.type === 'EVENT_WINNER' ? '당첨 알림' : detail ? '운영진 메시지' : '알림함'}</h2></header>
      {error && <div className="inbox-error" role="alert">{error} <button onClick={() => void load(cursor.current, true)}>다시 조회</button></div>}
      {busy && <p role="status">메시지를 열고 있어요…</p>}
      {detail ? <article className="inbox-letter">
        <span className="inbox-stamp">온탑 운영진</span><h3>{detail.type === 'FEEDBACK_REPLY' ? '보내주신 의견에 답변이 왔어요' : detail.title}</h3>
        <time dateTime={detail.createdAt}>{new Date(detail.createdAt).toLocaleString('ko-KR')}</time>
        <p className="inbox-letter-body">{detail.body}</p>
        {detail.type === 'FEEDBACK_REPLY' && <aside><strong>내가 보낸 의견 · {statusLabels[detail.feedbackStatus!]}</strong><p>{detail.feedbackText}</p></aside>}
        {detail.reward && <p>{rewardLabel(detail.reward)} · {detail.reward.claimedAt ? '수령 완료' : '아직 받지 않은 보상'}</p>}
        {detail.event && <aside><strong>{detail.event.weekStartDate} 주차 당첨 내역</strong>
          <ul>{detail.event.awards.map(award => <li key={award.winnerId}>{award.eventType} · {award.place}등 · {award.prizeName} · {award.deliveryStatus === 'DELIVERED' ? '지급 완료' : '지급 대기'}</li>)}</ul>
          <p>{detail.event.allPrizesDelivered ? '모든 경품의 지급이 완료됐어요.' : detail.event.contactStatus === 'SUBMITTED' ? detail.event.contactEdited ? '연락처 수정 완료' : '연락처 입력 완료' : detail.event.contactStatus === 'EXPIRED' ? '연락처 보관 기간 종료' : '연락처 입력 대기'}</p>
          {onOpenWinnings && <button className="inbox-primary" onClick={openWinnings}>
            {!detail.event.allPrizesDelivered && detail.event.contactEditable
              ? detail.event.contactStatus === 'SUBMITTED' ? '연락처 확인·수정' : '연락처 입력하기'
              : '내 당첨 내역 보기'}
          </button>}</aside>}
        <button className="inbox-primary" onClick={() => { setDetail(null); setError('') }}>목록으로</button>
      </article> : <>
        <nav className="inbox-tabs" aria-label="알림 종류">{([['all','전체'],['unread','안 읽음'],['reward','보상']] as const).map(([key,label]) =>
          <button key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>)}</nav>
        <p className="inbox-subtitle">안 읽은 소식 {page?.unreadCount ?? 0}개 · {trail.length}페이지</p>
        <div className="inbox-list">{values.map(value => value.reward ? <div key={value.id}
          className={`inbox-row inbox-reward-row ${value.readAt ? 'is-read' : 'is-new'}`}>
          <RewardIcon kind={value.reward.kind}/><span><strong className="inbox-title"><ReadState read={!!value.readAt}/>{rewardLabel(value.reward)}</strong><small>{value.title}</small>
            <time dateTime={value.reward.expiresAt}>수령 기한 · {new Date(value.reward.expiresAt).toLocaleString('ko-KR')}</time></span>
          <button className={value.reward.claimedAt ? '' : 'inbox-primary'} disabled={busy || !!value.reward.claimedAt}
            aria-label={`${rewardLabel(value.reward)} ${value.reward.claimedAt ? '수령 완료' : '받기'}`} onClick={() => void claim(value)}>
            {value.reward.claimedAt ? '수령 완료' : busy ? '확인 중…' : '받기'}</button>
          <button aria-label={`${rewardLabel(value.reward)} ${value.reward.claimedAt ? '수령 내역' : '안내 보기'}`} disabled={busy}
            onClick={() => value.reward?.claimedAt ? void claim(value) : void show(value.id)}>›</button>
        </div> : <button key={value.id} className={`inbox-row ${value.readAt ? 'is-read' : 'is-new'}`}
            disabled={busy} onClick={() => void show(value.id)}>
            <span className="inbox-envelope" aria-hidden="true">✉</span><span><strong className="inbox-title"><ReadState read={!!value.readAt}/>{value.title}</strong>
              <small>{value.type === 'EVENT_WINNER' ? `${value.eventWeekStartDate} 주차 당첨 내역을 확인해 주세요.` : '보내주신 소리함 의견에 답변을 남겼습니다.'}</small><time dateTime={value.createdAt}>{new Date(value.createdAt).toLocaleString('ko-KR')}</time></span>
            <span className="inbox-row-arrow" aria-hidden="true">›</span></button>)}</div>
        {values.length === 0 && <p className="inbox-empty">{!page ? '알림을 확인하고 있어요.' : filter === 'reward' ? '아직 도착한 보상이 없어요.'
          : filter === 'unread' ? '이 페이지에 안 읽은 알림이 없어요.' : '아직 도착한 소식이 없어요.'}</p>}
        <footer><button disabled={trail.length < 2 || busy} onClick={() => { const next = trail.slice(0,-1); setTrail(next); void load(next.at(-1)!, true) }}>이전</button>
          <button onClick={() => void load(cursor.current, true)}>새로고침</button>
          <button disabled={!page?.nextCursor || busy} onClick={() => { if (page?.nextCursor) { setTrail([...trail,page.nextCursor]); void load(page.nextCursor,true) } }}>다음</button></footer>
        <p className="inbox-footnote">읽은 메시지도 여기서 다시 확인할 수 있어요.</p>
      </>}
      </div>
      {receipt && <div className="inbox-reward-shade"><section className="inbox-reward-popup" aria-labelledby="reward-received-title">
        <span className="inbox-eyebrow">온탑의 작은 선물</span><h3 id="reward-received-title">보상을 받았어요!</h3>
        <div className={`inbox-reward-illustration is-${receipt.kind === 'COIN' ? 'coin' : 'ticket'}`} aria-hidden="true"><RewardIcon kind={receipt.kind}/><RewardIcon kind={receipt.kind}/><RewardIcon kind={receipt.kind}/></div><strong className="inbox-reward-amount">{rewardLabel(receipt)}</strong>
        <p>{receipt.kind === 'COIN' ? '지갑에 엽전이 추가됐어요.' : '보유 뽑기권에 추가됐어요.'}</p>
        <button ref={confirm} className="inbox-primary" onClick={() => setReceipt(null)}>확인</button>
      </section></div>}
    </MenuDialog>}
  </>
}

function ReadState({ read }: { read: boolean }) {
  return read ? <span className="inbox-read-label">읽음</span>
    : <><span className="inbox-unread-dot" aria-hidden="true"/><span className="inbox-sr-only">안 읽음 · </span></>
}

function RewardIcon({ kind }: { kind: 'COIN' | 'GACHA_TICKET' }) {
  return kind === 'COIN' ? <img className="inbox-reward-icon" src={coinArt} alt=""/>
    : <svg className="inbox-reward-icon inbox-ticket-icon" viewBox="0 0 120 100" aria-hidden="true">
      <g transform="rotate(-12 60 50)"><path d="M12 25h96v14a11 11 0 0 0 0 22v14H12V61a11 11 0 0 0 0-22Z" fill="#285b45" stroke="#caa451" strokeWidth="4"/>
      <path d="M24 32h72v36H24Z" fill="none" stroke="#d9bc75"/><path d="m60 37 4 8 9 1-7 6 2 10-8-5-8 5 2-10-7-6 9-1Z" fill="#e5c47b"/></g></svg>
}
