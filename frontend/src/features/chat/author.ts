import { displayNickname, type PublicDisplayName } from '../gameMaster/displayName'

/** Missing/unfinished profiles may be filled later; a confirmed name is immutable per message. */
export function chatAuthorName(profile: (PublicDisplayName & { nicknameKnown?: boolean }) | undefined) {
  return profile && profile.nicknameKnown !== false ? displayNickname(profile, '') : undefined
}
