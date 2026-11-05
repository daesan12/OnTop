export const NICKNAME_MAX = 8

const NICKNAME_FORMAT = /^[가-힣A-Za-z0-9]{2,8}$/
const RESERVED_GAME_MASTER_PREFIX = /^gm/i

export type NicknameInputProblem = 'format' | 'reserved'
/** Only the server knows its forbidden-word list; the client never mirrors it. */
export type NicknameServerProblem = NicknameInputProblem | 'inappropriate'

export const NICKNAME_RESERVED_MESSAGE = 'GM으로 시작하는 닉네임은 사용할 수 없어요.'
export const NICKNAME_INAPPROPRIATE_MESSAGE = '사용할 수 없는 표현이 포함된 닉네임이에요.'

export function nicknameInputProblem(nickname: string): NicknameInputProblem | null {
  if (!NICKNAME_FORMAT.test(nickname)) return 'format'
  if (RESERVED_GAME_MASTER_PREFIX.test(nickname)) return 'reserved'
  return null
}

export function isValidNickname(nickname: string) {
  return nicknameInputProblem(nickname) === null
}

/** Server nickname-policy error codes shared by availability, onboarding and nickname update. */
export function nicknameServerProblem(code: string | null | undefined): NicknameServerProblem | null {
  if (code === 'USER_INVALID_NICKNAME') return 'format'
  if (code === 'USER_RESERVED_NICKNAME') return 'reserved'
  if (code === 'USER_INAPPROPRIATE_NICKNAME') return 'inappropriate'
  return null
}
