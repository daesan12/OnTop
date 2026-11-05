import { OnboardingError, type OnboardingNicknameAvailability } from '../auth/authFlow'
import {
  NICKNAME_INAPPROPRIATE_MESSAGE,
  NICKNAME_RESERVED_MESSAGE,
  nicknameInputProblem,
  nicknameServerProblem,
} from '../features/user/nicknamePolicy'

export type NicknameCheckStatus = 'checking' | OnboardingNicknameAvailability
/** A result belongs to the exact value it checked; any edit makes it stale. */
export type NicknameCheck = { value: string; status: NicknameCheckStatus }

export type NicknameCheckRequest = (nickname: string, signal: AbortSignal) => Promise<OnboardingNicknameAvailability>

/**
 * Runs availability checks so that only the latest one can answer. A newer check or cancel()
 * aborts the older request, and its late answer resolves to null instead of a result.
 * An expired onboarding token still surfaces as OnboardingError for the latest check.
 */
export function createNicknameChecker(request: NicknameCheckRequest) {
  let current: AbortController | null = null
  return {
    async check(nickname: string): Promise<NicknameCheck | null> {
      current?.abort()
      const controller = new AbortController()
      current = controller
      let status: OnboardingNicknameAvailability
      try {
        status = await request(nickname, controller.signal)
      } catch (error) {
        if (controller.signal.aborted || current !== controller) return null
        if (error instanceof OnboardingError) {
          current = null
          throw error
        }
        status = 'unavailable'
      }
      if (controller.signal.aborted || current !== controller) return null
      current = null
      return { value: nickname, status }
    },
    cancel() {
      current?.abort()
      current = null
    },
  }
}

/** Checks the format locally first; only a well-formed name reaches the server. */
export function localNicknameCheck(nickname: string): NicknameCheck | null {
  const problem = nicknameInputProblem(nickname)
  return problem ? { value: nickname, status: problem } : null
}

export type NicknameFeedbackTone = 'info' | 'ok' | 'error'
export type NicknameFeedback = { message: string; tone: NicknameFeedbackTone }

const MESSAGES: Record<NicknameCheckStatus | 'needs-check', NicknameFeedback> = {
  'needs-check': { message: '중복 확인이 필요해요.', tone: 'info' },
  checking: { message: '닉네임 확인 중…', tone: 'info' },
  available: { message: '사용 가능한 닉네임이에요.', tone: 'ok' },
  taken: { message: '이미 사용 중인 닉네임이에요.', tone: 'error' },
  format: { message: '한글, 영문, 숫자로 2~8자 입력해 주세요.', tone: 'error' },
  reserved: { message: NICKNAME_RESERVED_MESSAGE, tone: 'error' },
  inappropriate: { message: NICKNAME_INAPPROPRIATE_MESSAGE, tone: 'error' },
  unavailable: { message: '닉네임을 확인하지 못했어요. 다시 시도해 주세요.', tone: 'error' },
}

/** The check result only counts while it matches the current input. */
export function currentNicknameCheck(nickname: string, check: NicknameCheck | null): NicknameCheckStatus | null {
  return check && check.value === nickname ? check.status : null
}

/**
 * Feedback under the nickname input. The reserved prefix shows as soon as it is typed (existing
 * behaviour); a format problem waits until the user asks for a check or submits.
 */
export function nicknameFeedback(nickname: string, check: NicknameCheck | null): NicknameFeedback | null {
  if (!nickname) return null
  const status = currentNicknameCheck(nickname, check)
  if (status) return MESSAGES[status]
  const problem = nicknameInputProblem(nickname)
  if (problem === 'reserved') return MESSAGES.reserved
  if (problem) return null
  return MESSAGES['needs-check']
}

/** Submitting never requires a check (the server validates again); it is blocked only by a known rejection. */
export function blocksSubmit(nickname: string, check: NicknameCheck | null) {
  const status = currentNicknameCheck(nickname, check)
  return nicknameInputProblem(nickname) !== null
    || status === 'taken' || status === 'format' || status === 'reserved' || status === 'inappropriate'
}

/** Maps a final onboarding rejection back onto the nickname so the input shows the same message as a check. */
export function nicknameCheckFromOnboardingError(nickname: string, code: string): NicknameCheck | null {
  if (code === 'USER_NICKNAME_ALREADY_EXISTS') return { value: nickname, status: 'taken' }
  const problem = nicknameServerProblem(code)
  return problem ? { value: nickname, status: problem } : null
}
