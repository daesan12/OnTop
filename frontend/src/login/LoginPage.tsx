import { socialAuthorizeUrl, type SocialProvider } from '../auth/socialLogin'

function startSocialLogin(provider: SocialProvider) {
  window.location.assign(socialAuthorizeUrl(provider, window.location.origin))
}

export function LoginPage() {
  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby="login-title">
        <h1 id="login-title" className="visually-hidden">온탑 로그인</h1>

        <div className="login-actions">
          <button className="entry-button entry-button--naver" type="button" onClick={() => startSocialLogin('naver')}>
            <span className="naver-mark" aria-hidden="true">N</span>
            <span>네이버로 계속하기</span>
          </button>

          <button className="entry-button entry-button--ssafy" type="button" onClick={() => startSocialLogin('ssafy')}>
            <span className="ssafy-mark" aria-hidden="true"><span>SSAFY</span><span>CODING</span><span>TEST</span></span>
            <span>SSAFY로 계속하기</span>
          </button>

          <div className="entry-divider" aria-hidden="true" />

          <button className="entry-button entry-button--guest" type="button" disabled aria-describedby="guest-availability">
            로그인 없이 둘러보기 · 준비중
          </button>
          <p className="guest-caption" id="guest-availability">게스트 로그인은 서버 연동 준비 중입니다.</p>
        </div>
      </section>
    </main>
  )
}
