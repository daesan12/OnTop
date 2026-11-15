import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { AuthCallbackPage } from './auth/AuthCallbackPage'
import { clearAuthSession, getAuthSession, logout, restoreInitialAuthSession } from './auth/authFlow'
import { clearWelcomeStoryRequest, readWelcomeStoryRequest, requestWelcomeStory } from './features/welcomeStory/pending'
import { LoginPage } from './login/LoginPage'
import { OnboardingPage } from './onboarding/OnboardingPage'
import { ParkPage } from './park/ParkPage'
import { forgetTabGames } from './game/resultRecovery'
import { preloadWorldAssets } from './world/worldAssets'
import { preloadWorldCanvas } from './park/loadWorldCanvas'
import { MaintenancePage } from './features/operation/MaintenancePage'
import { loadServiceOperation, unavailableServiceOperation, type ServiceOperationStatus } from './features/operation/serviceOperation'
import { adminRoutes, adminSectionForPage, adminSectionForPath, type AdminPage, type AdminSection } from './features/admin/adminRoutes'

const AdminShell = lazy(() => import('./features/admin/AdminShell').then(m => ({ default: m.AdminShell })))
type Page = 'checking' | 'login' | 'callback' | 'onboarding' | 'park' | 'maintenance'
  | AdminPage

export default function App() {
  const [page, setPage] = useState<Page>(() =>
    window.location.pathname === '/auth/callback' ? 'callback' : 'checking',
  )
  const [exitError, setExitError] = useState('')
  const [welcomeStoryDeadline, setWelcomeStoryDeadline] = useState(readWelcomeStoryRequest)
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
        const adminSection = adminSectionForPath(window.location.pathname)
        window.history.replaceState(null, '', adminSection ? adminRoutes[adminSection].path : '/park')
        setPage(adminSection ? adminRoutes[adminSection].page : 'park')
      } else {
        clearWelcomeStoryRequest()
        setWelcomeStoryDeadline(null)
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

  const onParkLogin = useCallback(() => {
    setWelcomeStoryDeadline(requestWelcomeStory())
    onAuthenticated()
  }, [onAuthenticated])

  const finishWelcomeStory = useCallback(() => {
    clearWelcomeStoryRequest()
    setWelcomeStoryDeadline(null)
  }, [])

  const onAdminNavigate = useCallback((section: AdminSection) => {
    window.history.pushState(null, '', adminRoutes[section].path)
    setPage(adminRoutes[section].page)
  }, [])

  const onOnboardingRequired = useCallback(() => {
    window.history.replaceState(null, '', '/onboarding')
    setPage('onboarding')
  }, [])

  const onReturnToLogin = useCallback(() => {
    finishWelcomeStory()
    clearAuthSession()
    window.history.replaceState(null, '', '/')
    setPage('login')
  }, [finishWelcomeStory])

  const onOperationBlocked = useCallback((status: ServiceOperationStatus) => {
    setOperation(status)
    setPage('maintenance')
  }, [])

  const onExit = async () => {
    setExitError('')
    try {
      await logout()
      finishWelcomeStory()
      forgetTabGames()
      window.history.replaceState(null, '', '/')
      setPage('login')
    } catch (error) {
      setExitError(error instanceof Error ? error.message : '공원에서 나가지 못했습니다.')
    }
  }

  if (page === 'callback') {
    return <AuthCallbackPage onAuthenticated={onParkLogin} onOnboardingRequired={onOnboardingRequired} />
  }
  if (page === 'onboarding' && getAuthSession()?.status === 'ONBOARDING_REQUIRED') {
    return <OnboardingPage onComplete={onParkLogin} onReturnToLogin={onReturnToLogin} />
  }
  if (page === 'park' && getAuthSession()?.status === 'AUTHENTICATED') {
    return <ParkPage onExit={onExit} exitError={exitError} onAuthEnded={onReturnToLogin}
      onOperationBlocked={onOperationBlocked}
      welcomeStoryDeadline={welcomeStoryDeadline} onWelcomeStoryComplete={finishWelcomeStory} />
  }
  if (page === 'maintenance' && operation) {
    return <MaintenancePage status={operation} onRetry={() => setPage('checking')} />
  }
  const adminSection = adminSectionForPage(page)
  if (adminSection && getAuthSession()?.status === 'AUTHENTICATED') {
    return <Suspense fallback={<main className="auth-loading" role="status">관리자 화면 준비 중…</main>}>
      <AdminShell section={adminSection} onNavigate={onAdminNavigate}
        onReturn={onAuthenticated} onAuthEnded={onReturnToLogin} />
    </Suspense>
  }
  if (page === 'checking') return <main className="auth-loading" role="status">로그인 상태 확인 중…</main>
  return <LoginPage />
}
