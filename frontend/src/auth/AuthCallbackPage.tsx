import { useEffect, useState } from 'react'
import { exchangeCallbackCode } from './authFlow'

type CallbackState =
  | { status: 'loading' }
  | { status: 'error'; message: string }

export function AuthCallbackPage({ onAuthenticated, onOnboardingRequired }: {
  onAuthenticated: () => void
  onOnboardingRequired: () => void
}) {
  const [state, setState] = useState<CallbackState>({ status: 'loading' })

  useEffect(() => {
    let active = true
    exchangeCallbackCode()
      .then((session) => {
        if (!active) return
        if (session.status === 'AUTHENTICATED') onAuthenticated()
        else onOnboardingRequired()
      })
      .catch((error: unknown) => {
        if (active) setState({ status: 'error', message: error instanceof Error ? error.message : '로그인을 완료하지 못했습니다.' })
      })
    return () => { active = false }
  }, [onAuthenticated, onOnboardingRequired])

  const title = state.status === 'loading' ? '로그인 확인 중' : '로그인을 완료하지 못했습니다'
  const detail = state.status === 'loading' ? '잠시만 기다려 주세요.' : state.message

  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby="callback-title">
        <div className="callback-content" role="status" aria-live="polite">
          <h1 id="callback-title">{title}</h1>
          <p>{detail}</p>
          {state.status === 'error' && <a href="/">로그인 화면으로 돌아가기</a>}
        </div>
      </section>
    </main>
  )
}
