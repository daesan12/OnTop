import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { AuthCallbackPage } from './auth/AuthCallbackPage'
import { clearAuthSession, getAuthSession, logout, restoreInitialAuthSession } from './auth/authFlow'
import { LoginPage } from './login/LoginPage'
import { OnboardingPage } from './onboarding/OnboardingPage'
import { ParkPage } from './park/ParkPage'
import { forgetTabGames } from './game/resultRecovery'
import { preloadWorldAssets } from './world/worldAssets'
import { preloadWorldCanvas } from './park/loadWorldCanvas'
import { MaintenancePage } from './features/operation/MaintenancePage'
import { loadServiceOperation, unavailableServiceOperation, type ServiceOperationStatus } from './features/operation/serviceOperation'

const AdminShell = lazy(() => import('./features/admin/AdminShell').then(m => ({ default: m.AdminShell })))
type Page = 'checking' | 'login' | 'callback' | 'onboarding' | 'park' | 'maintenance'
  | 'admin' | 'admin-feedback' | 'admin-analytics' | 'admin-wallet-grants' | 'admin-announcements'
  | 'admin-operations' | 'admin-events'

export default function App() {
  const [page, setPage] = useState<Page>(() =>
    window.location.pathname === '/auth/callback' ? 'callback' : 'checking',
  )
  const [exitError, setExitError] = useState('')
  const [operation, setOperation] = useState<ServiceOperationStatus | null>(null)

  useEffect(() => {
    if (page === 'callback' || page === 'onboarding'
      || page === 'checking' && window.location.pathname === '/park') {
      // Start textures/characters before constructing the procedural world, so
      // the first scene render need not suspend and repeat expensive setup.
      preloadWorldAssets()
      preloadWorldCanvas()
    }
  }, [page])

  useEffect(() => {
    // A history-restored login page can retain stale React state after OAuth.
    const recheckSession = () => {
      if (window.location.pathname !== '/auth/callback') setPage('checking')
    }
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) recheckSession()
    }

    window.addEventListener('pageshow', onPageShow)
    window.addEventListener('popstate', recheckSession)
    return () => {
      window.removeEventListener('pageshow', onPageShow)
      window.removeEventListener('popstate', recheckSession)
    }
  }, [])

  useEffect(() => {
    if (page !== 'checking') return
    let active = true
    const restore = async () => {
      if (!window.location.pathname.startsWith('/admin')) {
        try {
          const status = await loadServiceOperation()
          if (!active) return
          if (status.mode !== 'NORMAL') {
            setOperation(status)
            setPage('maintenance')
            return
          }
        } catch {
          if (!active) return
          setOperation(unavailableServiceOperation())
          setPage('maintenance')
          return
        }
      }
      const authenticated = await restoreInitialAuthSession()
      if (!active) return
      if (authenticated) {
        const path = window.location.pathname
        const next = path === '/admin/feedback' ? 'admin-feedback'
          : path === '/admin/announcements' ? 'admin-announcements'
          : path === '/admin/operations' ? 'admin-operations'
          : path === '/admin/events' ? 'admin-events'
          : path === '/admin/analytics' ? 'admin-analytics' : path === '/admin/wallet-grants' ? 'admin-wallet-grants'
            : path === '/admin' ? 'admin' : 'park'
        window.history.replaceState(null, '', next === 'admin-feedback' ? '/admin/feedback'
          : next === 'admin-announcements' ? '/admin/announcements'
          : next === 'admin-operations' ? '/admin/operations'
          : next === 'admin-events' ? '/admin/events'
          : next === 'admin-analytics' ? '/admin/analytics' : next === 'admin-wallet-grants' ? '/admin/wallet-grants'
            : next === 'admin' ? '/admin' : '/park')
        setPage(next)
      } else {
        if (window.location.pathname !== '/') window.history.replaceState(null, '', '/')
        setPage('login')
      }
    }
    void restore()
    return () => { active = false }
  }, [page])

  const onAuthenticated = useCallback(() => {
    window.history.replaceState(null, '', '/park')
    setPage('checking')
  }, [])

  const onAdminNavigate = useCallback((section: 'home' | 'feedback' | 'analytics' | 'wallet-grants' | 'announcements' | 'operations' | 'events') => {
    const path = section === 'home' ? '/admin' : section === 'feedback' ? '/admin/feedback'
      : section === 'announcements' ? '/admin/announcements' : section === 'operations' ? '/admin/operations'
      : section === 'events' ? '/admin/events'
        : section === 'analytics' ? '/admin/analytics' : '/admin/wallet-grants'
    window.history.pushState(null, '', path)
    setPage(section === 'home' ? 'admin' : section === 'feedback' ? 'admin-feedback'
      : section === 'announcements' ? 'admin-announcements' : section === 'operations' ? 'admin-operations'
      : section === 'events' ? 'admin-events'
        : section === 'analytics' ? 'admin-analytics' : 'admin-wallet-grants')
  }, [])

  const onOnboardingRequired = useCallback(() => {
    window.history.replaceState(null, '', '/onboarding')
    setPage('onboarding')
  }, [])

  const onReturnToLogin = useCallback(() => {
    clearAuthSession()
    window.history.replaceState(null, '', '/')
    setPage('login')
  }, [])

  const onOperationBlocked = useCallback((status: ServiceOperationStatus) => {
    setOperation(status)
    setPage('maintenance')
  }, [])

  const onExit = async () => {
    setExitError('')
    try {
      await logout()
      forgetTabGames()
      window.history.replaceState(null, '', '/')
      setPage('login')
    } catch (error) {
      setExitError(error instanceof Error ? error.message : '공원에서 나가지 못했습니다.')
    }
  }

  if (page === 'callback') {
    return <AuthCallbackPage onAuthenticated={onAuthenticated} onOnboardingRequired={onOnboardingRequired} />
  }
  if (page === 'onboarding' && getAuthSession()?.status === 'ONBOARDING_REQUIRED') {
    return <OnboardingPage onComplete={onAuthenticated} onReturnToLogin={onReturnToLogin} />
  }
  if (page === 'park' && getAuthSession()?.status === 'AUTHENTICATED') {
    return <ParkPage onExit={onExit} exitError={exitError} onAuthEnded={onReturnToLogin}
      onOperationBlocked={onOperationBlocked} />
  }
  if (page === 'maintenance' && operation) {
    return <MaintenancePage status={operation} onRetry={() => setPage('checking')} />
  }
  if ((page === 'admin' || page === 'admin-feedback' || page === 'admin-analytics' || page === 'admin-wallet-grants'
    || page === 'admin-announcements' || page === 'admin-operations' || page === 'admin-events')
    && getAuthSession()?.status === 'AUTHENTICATED') {
    return <Suspense fallback={<main className="auth-loading" role="status">관리자 화면 준비 중…</main>}>
      <AdminShell section={page === 'admin' ? 'home' : page === 'admin-feedback' ? 'feedback'
        : page === 'admin-announcements' ? 'announcements' : page === 'admin-operations' ? 'operations'
          : page === 'admin-events' ? 'events'
          : page === 'admin-analytics' ? 'analytics' : 'wallet-grants'} onNavigate={onAdminNavigate}
        onReturn={onAuthenticated} onAuthEnded={onReturnToLogin} />
    </Suspense>
  }
  if (page === 'checking') return <main className="auth-loading" role="status">로그인 상태 확인 중…</main>
  return <LoginPage />
}
