export interface PublicDisplayName {
  nickname: string
  gameMaster?: boolean
}

/** Presentation only: the stored nickname remains unchanged. */
export function displayNickname(profile: PublicDisplayName | undefined, fallback: string) {
  if (!profile) return fallback
  return profile.gameMaster ? `GM ${profile.nickname}` : profile.nickname
}
