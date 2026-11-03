import { avatars, useSession, type DisplayProfile } from './worldClient'

/** Seed the authenticated users/me display; WORLD_STATE supplies later public profile updates. */
export function setDisplayProfiles(
  profiles: Record<string, DisplayProfile>,
  account: { nickname: string; balance: number | null } | null = null,
) {
  for (const [id, profile] of Object.entries(profiles)) {
    if (
      !id ||
      !profile.nickname.trim() ||
      !['man', 'girl'].includes(profile.character) ||
      (profile.gameMaster !== undefined && typeof profile.gameMaster !== 'boolean')
    )
      throw new Error('표시용 프로필을 확인해주세요.')
  }
  if (
    account &&
    (typeof account.nickname !== 'string' ||
      (account.balance !== null &&
        (!Number.isSafeInteger(account.balance) || account.balance < 0)))
  )
    throw new Error('표시용 계정 정보를 확인해주세요.')
  const state = useSession.getState()
  if (!state.sessionId) return
  for (const [id, avatar] of avatars) {
    avatar.character = profiles[id]?.character ?? 'man'
    avatar.nickname =
      profiles[id]?.nickname ??
      (id === state.sessionId ? '나' : '산책자 ' + id.slice(-6))
  }
  useSession.setState({ profiles, account })
}
