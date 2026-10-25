export type SocialProvider = 'ssafy' | 'naver'

const authorizePaths: Record<SocialProvider, string> = {
  ssafy: '/api/v1/auth/ssafy/authorize',
  naver: '/api/v1/auth/naver/authorize',
}

/** Navigate to the BE so its OAuth session, provider and state stay together. */
export function socialAuthorizeUrl(provider: SocialProvider, origin: string, development = import.meta.env.DEV): string {
  if (provider !== 'ssafy' && provider !== 'naver') throw new Error('지원하지 않는 로그인 제공자입니다.')
  const url = new URL(authorizePaths[provider], origin)
  // Preserve the existing local SSAFY cookie-host rule for both providers.
  if (development && url.hostname === '127.0.0.1') url.hostname = 'localhost'
  return url.toString()
}
