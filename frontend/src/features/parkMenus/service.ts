import { RestError } from '../../network/restError'
import { setDisplayProfiles } from '../../network/profileBridge'
import { useSession } from '../../network/worldClient'
import type { ParkRuntimePort } from '../../park/runtime/contracts'

/** Same rule as the BE NicknameValidator (docs/nickname-availability.md); the server stays the final judge. */
export const NICKNAME_PATTERN = /^[가-힣A-Za-z0-9]{2,8}$/
export const NICKNAME_MAX = 8

export type NicknameProblem = 'format' | 'taken' | 'unavailable'

export function nicknameProblem(error: unknown): NicknameProblem {
  if (error instanceof RestError && error.code === 'USER_NICKNAME_ALREADY_EXISTS') return 'taken'
  if (error instanceof RestError && error.code === 'USER_INVALID_NICKNAME') return 'format'
  return 'unavailable'
}

/** GET /api/v1/users/nickname-availability — a check only; it reserves nothing. */
export async function checkNickname(runtime: ParkRuntimePort, nickname: string, signal?: AbortSignal) {
  const body = await runtime.requestJSON(
    `/api/v1/users/nickname-availability?nickname=${encodeURIComponent(nickname)}`, { signal })
  if (typeof body !== 'object' || body === null || typeof (body as { available?: unknown }).available !== 'boolean')
    throw new Error('닉네임 확인 응답을 확인할 수 없습니다.')
  return (body as { available: boolean }).available
}

/** PATCH /api/v1/users/me, then show the saved name right away; WORLD_STATE later confirms it for everyone. */
export async function updateNickname(runtime: ParkRuntimePort, nickname: string) {
  const body = await runtime.requestJSON('/api/v1/users/me', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname }),
  })
  const saved = typeof body === 'object' && body !== null ? (body as { nickname?: unknown }).nickname : undefined
  if (typeof saved !== 'string' || !saved.trim()) throw new Error('닉네임 변경 응답을 확인할 수 없습니다.')
  const { sessionId, profiles, account } = useSession.getState()
  const own = profiles[sessionId]
  if (own && account) setDisplayProfiles({ ...profiles, [sessionId]: { ...own, nickname: saved } }, { ...account, nickname: saved })
  return saved
}

/** DELETE /api/v1/users/me (204). The caller ends the park session; the server also closes sockets with 4403. */
export async function withdraw(runtime: ParkRuntimePort) {
  await runtime.requestJSON('/api/v1/users/me', { method: 'DELETE' })
}
