import { useState } from 'react'

type EntryMethod = 'naver' | 'guest'

const entryMessages: Record<EntryMethod, string> = {
  naver: '네이버 로그인 연결은 다음 작업에서 이어집니다.',
  guest: '게스트 광장 화면은 다음 작업에서 이어집니다.',
}

function startSsafyLogin() {
  const url = new URL('/api/v1/auth/ssafy/authorize', window.location.origin)
  if (import.meta.env.DEV && url.hostname === '127.0.0.1') url.hostname = 'localhost'
  window.location.assign(url)
}

export function LoginPage() {
  const [message, setMessage] = useState('')

  const selectEntry = (method: EntryMethod) => setMessage(entryMessages[method])

  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby="login-title">
        <h1 id="login-title" className="visually-hidden">온탑 로그인</h1>

        <div className="login-actions">
          <button className="entry-button entry-button--naver" type="button" onClick={() => selectEntry('naver')}>
            <span className="naver-mark" aria-hidden="true">N</span>
            <span>네이버로 계속하기</span>
          </button>

          <button className="entry-button entry-button--ssafy" type="button" onClick={startSsafyLogin}>
            <span className="ssafy-mark" aria-hidden="true"><span>SSAFY</span><span>CODING</span><span>TEST</span></span>
            <span>SSAFY로 계속하기</span>
          </button>

          <div className="entry-divider" aria-hidden="true" />

          <button className="entry-button entry-button--guest" type="button" onClick={() => selectEntry('guest')}>
            로그인 없이 둘러보기
          </button>
          <p className="guest-caption">게스트로도 산책과 채팅을 즐길 수 있어요</p>
        </div>
        <p className="entry-status" role="status" aria-live="polite">{message}</p>
      </section>
    </main>
  )
}
