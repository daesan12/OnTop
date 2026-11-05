import { describe, expect, it } from 'vitest'
import {
  isValidNickname,
  NICKNAME_INAPPROPRIATE_MESSAGE,
  nicknameInputProblem,
  nicknameServerProblem,
} from '../../src/features/user/nicknamePolicy'
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

  it('서버 욕설 닉네임 오류를 중복·예약어와 구분한다', () => {
    expect(nicknameProblem(new RestError(400, 'USER_INAPPROPRIATE_NICKNAME', '부적절'))).toBe('inappropriate')
    expect(nicknameProblem(new RestError(409, 'USER_NICKNAME_ALREADY_EXISTS', '중복'))).toBe('taken')
    expect(nicknameProblem(new RestError(400, 'USER_INVALID_NICKNAME', '형식'))).toBe('format')
    expect(nicknameProblem(new RestError(503, 'USER_PROFILE_UPDATE_UNAVAILABLE', '장애'))).toBe('unavailable')
    expect(nicknameProblem(new Error('offline'))).toBe('unavailable')
    expect(nicknameServerProblem('USER_INAPPROPRIATE_NICKNAME')).toBe('inappropriate')
    expect(nicknameServerProblem('USER_NICKNAME_ALREADY_EXISTS')).toBeNull()
    expect(NICKNAME_INAPPROPRIATE_MESSAGE).toBe('사용할 수 없는 표현이 포함된 닉네임이에요.')
  })

  it('클라이언트는 금칙어를 판정하지 않고 서버에 맡긴다', () => {
    expect(nicknameInputProblem('시발')).toBeNull()
    expect(nicknameInputProblem('병신')).toBeNull()
  })
})
