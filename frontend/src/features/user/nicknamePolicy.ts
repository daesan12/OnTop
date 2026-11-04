export const NICKNAME_MAX = 8

const NICKNAME_FORMAT = /^[가-힣A-Za-z0-9]{2,8}$/
const RESERVED_GAME_MASTER_PREFIX = /^gm/i

export type NicknameInputProblem = 'format' | 'reserved'

export function nicknameInputProblem(nickname: string): NicknameInputProblem | null {
  if (!NICKNAME_FORMAT.test(nickname)) return 'format'
  if (RESERVED_GAME_MASTER_PREFIX.test(nickname)) return 'reserved'
  return null
}

export function isValidNickname(nickname: string) {
  return nicknameInputProblem(nickname) === null
}
