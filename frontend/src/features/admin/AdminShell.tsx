import { useCallback, useEffect, useRef, useState } from 'react'
import { AdminFeedbackPage } from '../feedback/AdminFeedbackPage'
import { AdminAccessError, loadAdminAccess, type AdminAccess } from './adminAccess'
import { AdminAnalyticsPage } from './AdminAnalyticsPage'
import { AdminWalletGrantPage } from './AdminWalletGrantPage'
import { AdminRewardManager } from '../notifications/AdminRewardManager'
import { AdminAnnouncementsPage } from '../announcements/AdminAnnouncementsPage'
import { AdminServiceOperationPage } from './AdminServiceOperationPage'
import { AdminEventsPage } from './AdminEventsPage'
import { adminRoutes, type AdminSection } from './adminRoutes'
import logo from '../../assets/entry/ontop-logo.webp'
import '../feedback/adminFeedback.css'
import './adminShell.css'

type MenuSection = Exclude<AdminSection, 'home'>
type MenuItem = {
  section: MenuSection
  label: string
  title: string
  description: string
  permission: 'read' | 'operate' | 'grant'
}

const menuItems: readonly MenuItem[] = [
  { section: 'operations', label: '운영 제어', title: '서비스 운영 제어',
    description: '신규 활동 차단·점검·정상 운영 상태를 안전하게 전환합니다.', permission: 'operate' },
  { section: 'announcements', label: '공지 관리', title: '공원 공지',
    description: '공지 문구·게시 순서·예약 기간을 관리합니다.', permission: 'operate' },
  { section: 'events', label: '이벤트 관리', title: '이벤트 관리',
    description: '응모권·게임·엽전 행사 결과를 확정하고 당첨자 제출 현황을 조회합니다.', permission: 'read' },
  { section: 'feedback', label: '소리함', title: '소리함 의견',
    description: '이용자가 남긴 비공개 의견을 확인합니다.', permission: 'read' },
  { section: 'analytics', label: '이용 분석', title: '이용 분석',
    description: '일별 이용 흐름과 게임별 집계를 확인합니다.', permission: 'read' },
  { section: 'wallet-grants', label: '보상 관리', title: '보상 관리',
    description: '회원별 엽전·뽑기권 선물과 수령 내역, 전 회원 엽전 지급을 관리합니다.', permission: 'grant' },
]

function canShow(item: MenuItem, access: AdminAccess): boolean {
  return item.permission === 'operate' ? access.canOperate
    : item.permission === 'grant' ? access.canGrant : access.canRead
}
type AccessState = { status: 'loading' } | { status: 'ready'; access: AdminAccess }
  | { status: 'forbidden' } | { status: 'unavailable'; message: string }

export function AdminShell({ section, onNavigate, onReturn, onAuthEnded }: {
  section: AdminSection
  onNavigate: (section: AdminSection) => void
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
  const visibleItems = state.status === 'ready' ? menuItems.filter(item => canShow(item, state.access)) : []

  return <main className="admin-feedback-page admin-shell">
    <header className="admin-feedback-header">
      <div className="admin-shell-brand"><img src={logo} alt="온탑"/><span>공원 관리소</span></div>
      <a href="/park" onClick={event => { event.preventDefault(); onReturn() }}>← 공원으로 돌아가기</a>
      <small>온탑 · 관리자 전용</small>
      <h1 ref={heading} tabIndex={-1}>{section === 'home' ? '관리자 페이지'
        : section === 'operations' ? '서비스 운영 제어' : section === 'announcements' ? '공원 공지 관리'
          : section === 'events' ? '이벤트 관리' : section === 'feedback' ? '소리함 의견 조회'
            : section === 'analytics' ? '일별·게임별 분석' : '보상 관리'}</h1>
      {state.status === 'ready' && <p>{section === 'home'
        ? '관리자 기능을 선택해주세요.' : section === 'feedback'
          ? '이용자가 비공개로 남긴 의견입니다. 서버에서 조회 권한을 확인합니다.'
          : section === 'operations' ? '신규 활동 차단부터 점검 종료까지 운영 상태를 안전하게 전환합니다.'
          : section === 'announcements' ? '소식을 적고 올리면 공원 맨 위 공지에 표시돼요.'
          : section === 'events' ? '회차별 행사 결과와 당첨자 제출 현황을 확인합니다.'
          : section === 'analytics' ? '행동 로그를 백업 기준으로 집계한 결과입니다. 서버에서 조회 권한을 확인합니다.'
            : '회원별 엽전·뽑기권 선물과 수령 상태를 확인하고, 전체 지급은 아래 별도 구역에서 진행합니다.'}</p>}
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
        <a href={adminRoutes.home.path} aria-current={section === 'home' ? 'page' : undefined}
          onClick={event => { event.preventDefault(); onNavigate('home') }}>관리자 홈</a>
        {visibleItems.map(item => <a key={item.section} href={adminRoutes[item.section].path}
          aria-current={section === item.section ? 'page' : undefined}
          onClick={event => { event.preventDefault(); onNavigate(item.section) }}>{item.label}</a>)}
      </nav>
      {section === 'home' ? <section className="admin-feedback-content admin-shell-home" aria-label="관리자 기능">
        <h2>관리자 기능</h2>
        {visibleItems.map(item => <a key={item.section} href={adminRoutes[item.section].path}
          onClick={event => { event.preventDefault(); onNavigate(item.section) }}>
          <strong>{item.title}</strong><span>{item.description}</span>
        </a>)}
      </section> : section === 'operations' ? state.access.canOperate ? <AdminServiceOperationPage onAuthEnded={onAuthEnded} />
        : <section role="alert">운영 관리자 권한이 필요합니다.</section>
        : section === 'announcements' ? state.access.canOperate ? <AdminAnnouncementsPage onAuthEnded={onAuthEnded} />
        : <section role="alert">운영 관리자 권한이 필요합니다.</section>
        : section === 'events' ? <AdminEventsPage access={state.access} onAuthEnded={onAuthEnded} />
        : section === 'feedback' ? <AdminFeedbackPage onAuthEnded={onAuthEnded} />
        : section === 'analytics' ? <AdminAnalyticsPage onAuthEnded={onAuthEnded} />
          : state.access.canGrant ? <><AdminRewardManager onAuthEnded={onAuthEnded} /><AdminWalletGrantPage onAuthEnded={onAuthEnded} /></>
            : <section className="admin-feedback-content" role="alert"><h2>지급 권한이 없습니다</h2>
              <p>엽전 지급 권한이 등록된 관리자 계정으로 다시 확인해주세요.</p></section>}
    </>}
  </main>
}
