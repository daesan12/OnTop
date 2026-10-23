import { useCallback, useEffect, useState } from 'react'
import { AuthCallbackPage } from './auth/AuthCallbackPage'
import { clearAuthSession, getAuthSession, logout, restoreAuthSession } from './auth/authFlow'
import { LoginPage } from './login/LoginPage'
import { OnboardingPage } from './onboarding/OnboardingPage'
import { ParkPage } from './park/ParkPage'

type Page = 'checking' | 'login' | 'callback' | 'onboarding' | 'park'

export default function App() {
  const [page, setPage] = useState<Page>(() =>
    window.location.pathname === '/auth/callback' ? 'callback' : 'checking',
  )
  const [exitError, setExitError] = useState('')

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
    restoreAuthSession().then((authenticated) => {
      if (!active) return
      if (authenticated) {
        window.history.replaceState(null, '', '/park')
        setPage('park')
      } else {
        if (window.location.pathname !== '/') window.history.replaceState(null, '', '/')
        setPage('login')
      }
    })
    return () => { active = false }
  }, [page])

  const onAuthenticated = useCallback(() => {
    window.history.replaceState(null, '', '/park')
    setPage('park')
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

  const onExit = async () => {
    setExitError('')
    try {
      await logout()
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
    return <ParkPage onExit={onExit} exitError={exitError} onAuthEnded={onReturnToLogin} />
  }
  if (page === 'checking') return <main className="auth-loading" role="status">로그인 상태 확인 중…</main>
  return <LoginPage />
}
