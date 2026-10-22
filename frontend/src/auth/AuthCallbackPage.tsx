import { useEffect, useState } from 'react'
import { exchangeCallbackCode, type AuthSession } from './authFlow'

type CallbackState =
  | { status: 'loading' }
  | { status: 'success'; session: AuthSession }
  | { status: 'error'; message: string }

export function AuthCallbackPage({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [state, setState] = useState<CallbackState>({ status: 'loading' })

  useEffect(() => {
    let active = true
    exchangeCallbackCode()
      .then((session) => {
        if (!active) return
        if (session.status === 'AUTHENTICATED') onAuthenticated()
        else setState({ status: 'success', session })
      })
      .catch((error: unknown) => {
        if (active) setState({ status: 'error', message: error instanceof Error ? error.message : '로그인을 완료하지 못했습니다.' })
      })
    return () => { active = false }
  }, [onAuthenticated])

  const title = state.status === 'loading' ? '로그인 확인 중' : state.status === 'error'
    ? '로그인을 완료하지 못했습니다' : state.session.status === 'AUTHENTICATED'
      ? 'SSAFY 로그인 완료' : '프로필 설정이 필요합니다'
  const detail = state.status === 'loading' ? '잠시만 기다려 주세요.' : state.status === 'error'
    ? state.message : state.session.status === 'AUTHENTICATED'
      ? '광장 화면이 연결되면 이곳에서 이어집니다.' : '첫 프로필 설정 화면이 연결되면 이어집니다.'

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
