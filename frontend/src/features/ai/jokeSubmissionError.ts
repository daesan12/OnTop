import { RestError } from '../../network/restError'

export const jokeSubmissionPath = '/local/ai/joke-contest/submissions'

export function jokeBusinessMessage(path: string, status: number, body: unknown): string | undefined {
  if (path !== jokeSubmissionPath || ![400, 403, 409].includes(status) || !body || typeof body !== 'object') return
  const message = (body as { message?: unknown }).message
  if (typeof message === 'string' && message.trim() && message.length <= 160 && !/[\u0000-\u001f]/.test(message)) return message
}

export function jokeSubmissionError(error: unknown): string {
  if (error instanceof RestError && [400, 403, 409].includes(error.status)) return error.message
  if (error instanceof RestError && error.status === 401) return '로그인을 다시 확인해주세요.'
  return '제출 결과를 확인하지 못했어요. 연결 상태를 확인하고 같은 입력으로 다시 시도해주세요.'
}
