import { useCallback, useEffect, useState } from 'react'
import { AuthCallbackPage } from './auth/AuthCallbackPage'
import { getAuthSession, logout, restoreAuthSession } from './auth/authFlow'
import { LoginPage } from './login/LoginPage'
import { ParkPage } from './park/ParkPage'

type Page = 'checking' | 'login' | 'callback' | 'park'

export default function App() {
  const [page, setPage] = useState<Page>(() =>
    window.location.pathname === '/auth/callback' ? 'callback' : 'checking',
  )
  const [exitError, setExitError] = useState('')

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

  if (page === 'callback') return <AuthCallbackPage onAuthenticated={onAuthenticated} />
  if (page === 'park' && getAuthSession()?.status === 'AUTHENTICATED') {
    return <ParkPage onExit={onExit} exitError={exitError} />
  }
  if (page === 'checking') return <main className="auth-loading" role="status">로그인 상태 확인 중…</main>
  return <LoginPage />
}
