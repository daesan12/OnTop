import { describe, expect, it } from 'vitest'
import { isValidNickname, nicknameInputProblem } from '../../src/features/user/nicknamePolicy'
import { nicknameProblem } from '../../src/features/parkMenus/service'
import { RestError } from '../../src/network/restError'

describe('nickname policy', () => {
  it.each(['GM', 'gm123', 'Gm관리자', 'gM사칭'])('%s GM 접두어를 거절한다', nickname => {
    expect(nicknameInputProblem(nickname)).toBe('reserved')
    expect(isValidNickname(nickname)).toBe(false)
  })

  it.each(['게임GM', '온탑GM', '가나', 'OnTop123'])('%s 허용 형식을 유지한다', nickname => {
    expect(nicknameInputProblem(nickname)).toBeNull()
    expect(isValidNickname(nickname)).toBe(true)
  })

  it.each(['', '가', '123456789', '가 나', '가!', '😀😀'])('%s 형식 오류를 유지한다', nickname => {
    expect(nicknameInputProblem(nickname)).toBe('format')
    expect(isValidNickname(nickname)).toBe(false)
  })

  it('서버 예약 닉네임 오류를 같은 안내로 분류한다', () => {
    expect(nicknameProblem(new RestError(400, 'USER_RESERVED_NICKNAME', '예약 닉네임'))).toBe('reserved')
  })
})
