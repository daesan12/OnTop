import { useCallback, useEffect, useRef, useState } from 'react'
import { AdminFeedbackPage } from '../feedback/AdminFeedbackPage'
import { AdminAccessError, loadAdminAccess, type AdminAccess } from './adminAccess'
import { AdminAnalyticsPage } from './AdminAnalyticsPage'
import { AdminWalletGrantPage } from './AdminWalletGrantPage'
import { AdminAnnouncementsPage } from '../announcements/AdminAnnouncementsPage'
import '../feedback/adminFeedback.css'
import './adminShell.css'

type Section = 'home' | 'feedback' | 'analytics' | 'wallet-grants' | 'announcements'
type AccessState = { status: 'loading' } | { status: 'ready'; access: AdminAccess }
  | { status: 'forbidden' } | { status: 'unavailable'; message: string }

export function AdminShell({ section, onNavigate, onReturn, onAuthEnded }: {
  section: Section
  onNavigate: (section: Section) => void
  onReturn: () => void
  onAuthEnded: () => void
}) {
  const [state, setState] = useState<AccessState>({ status: 'loading' })
  const request = useRef<AbortController | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const check = useCallback(async () => {
    request.current?.abort()
    const abort = request.current = new AbortController()
    setState({ status: 'loading' })
    try {
      const access = await loadAdminAccess(abort.signal)
      if (!abort.signal.aborted) setState(access.canRead ? { status: 'ready', access } : { status: 'forbidden' })
    } catch (cause) {
      if (abort.signal.aborted) return
      if (cause instanceof AdminAccessError && cause.kind === 'unauthenticated') { onAuthEnded(); return }
      setState(cause instanceof AdminAccessError && cause.kind === 'forbidden'
        ? { status: 'forbidden' }
        : { status: 'unavailable', message: cause instanceof AdminAccessError ? cause.message : '관리자 권한을 확인하지 못했습니다. 다시 시도해주세요.' })
    }
  }, [onAuthEnded])

  useEffect(() => {
    let active = true
    queueMicrotask(() => { if (active) void check() })
    return () => { active = false; request.current?.abort() }
  }, [check])
  useEffect(() => { heading.current?.focus() }, [section, state.status])

  return <main className="admin-feedback-page admin-shell">
    <header className="admin-feedback-header">
      <a href="/park" onClick={event => { event.preventDefault(); onReturn() }}>← 공원으로 돌아가기</a>
      <small>온탑 · 관리자 전용</small>
      <h1 ref={heading} tabIndex={-1}>{section === 'home' ? '관리자 페이지'
        : section === 'announcements' ? '공원 공지 관리' : section === 'feedback' ? '소리함 의견 조회' : section === 'analytics' ? '일별·게임별 분석' : '전 회원 엽전 지급'}</h1>
      {state.status === 'ready' && <p>{section === 'home'
        ? '관리자 기능을 선택해주세요.' : section === 'feedback'
          ? '이용자가 비공개로 남긴 의견입니다. 서버에서 조회 권한을 확인합니다.'
          : section === 'announcements' ? '공원에 보여줄 문구와 게시 기간·순서를 관리합니다.'
          : section === 'analytics' ? '행동 로그를 백업 기준으로 집계한 결과입니다. 서버에서 조회 권한을 확인합니다.'
            : '대상 인원과 총액을 미리 확인한 뒤 모든 활성 회원에게 엽전을 지급합니다.'}</p>}
    </header>
    {state.status === 'loading' && <p role="status">관리자 권한을 확인하고 있어요…</p>}
    {state.status === 'forbidden' && <section className="admin-feedback-content" role="alert">
      <h2>접근 권한이 없습니다</h2><p>관리자 계정으로 로그인한 뒤 다시 시도해주세요.</p>
    </section>}
    {state.status === 'unavailable' && <section className="admin-feedback-content" role="alert">
      <h2>권한을 확인하지 못했습니다</h2><p>{state.message}</p>
      <button type="button" onClick={() => void check()}>다시 시도</button>
    </section>}
    {state.status === 'ready' && <>
      <nav className="admin-shell-nav" aria-label="관리자 메뉴">
        {state.access.canOperate && <a href="/admin/announcements" aria-current={section === 'announcements' ? 'page' : undefined}
          onClick={event => { event.preventDefault(); onNavigate('announcements') }}>공지 관리</a>}
        <a href="/admin" aria-current={section === 'home' ? 'page' : undefined}
          onClick={event => { event.preventDefault(); onNavigate('home') }}>관리자 홈</a>
        <a href="/admin/feedback" aria-current={section === 'feedback' ? 'page' : undefined}
          onClick={event => { event.preventDefault(); onNavigate('feedback') }}>소리함</a>
        <a href="/admin/analytics" aria-current={section === 'analytics' ? 'page' : undefined}
          onClick={event => { event.preventDefault(); onNavigate('analytics') }}>이용 분석</a>
        {state.access.canGrant && <a href="/admin/wallet-grants" aria-current={section === 'wallet-grants' ? 'page' : undefined}
          onClick={event => { event.preventDefault(); onNavigate('wallet-grants') }}>엽전 지급</a>}
      </nav>
      {section === 'home' ? <section className="admin-feedback-content admin-shell-home" aria-label="관리자 기능">
        <h2>관리자 기능</h2>
        {state.access.canOperate && <a href="/admin/announcements" onClick={event => { event.preventDefault(); onNavigate('announcements') }}>
          <strong>공원 공지</strong><span>공지 문구·게시 순서·예약 기간을 관리합니다.</span></a>}
        <a href="/admin/feedback" onClick={event => { event.preventDefault(); onNavigate('feedback') }}>
          <strong>소리함 의견</strong><span>이용자가 남긴 비공개 의견을 확인합니다.</span>
        </a>
        <a href="/admin/analytics" onClick={event => { event.preventDefault(); onNavigate('analytics') }}>
          <strong>이용 분석</strong><span>일별 이용 흐름과 게임별 집계를 확인합니다.</span>
        </a>
        {state.access.canGrant && <a href="/admin/wallet-grants" onClick={event => { event.preventDefault(); onNavigate('wallet-grants') }}>
          <strong>전 회원 엽전 지급</strong><span>대상과 총액을 미리 확인하고 활성 회원 전체에 엽전을 지급합니다.</span>
        </a>}
      </section> : section === 'announcements' ? state.access.canOperate ? <AdminAnnouncementsPage onAuthEnded={onAuthEnded} />
        : <section role="alert">운영 관리자 권한이 필요합니다.</section>
        : section === 'feedback' ? <AdminFeedbackPage onAuthEnded={onAuthEnded} />
        : section === 'analytics' ? <AdminAnalyticsPage onAuthEnded={onAuthEnded} />
          : state.access.canGrant ? <AdminWalletGrantPage onAuthEnded={onAuthEnded} />
            : <section className="admin-feedback-content" role="alert"><h2>지급 권한이 없습니다</h2>
              <p>엽전 지급 권한이 등록된 관리자 계정으로 다시 확인해주세요.</p></section>}
    </>}
  </main>
}
