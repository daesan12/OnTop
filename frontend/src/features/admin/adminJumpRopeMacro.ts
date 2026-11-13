import { getAuthSession, restoreAuthSession } from '../../auth/authFlow'
import { record } from '../../network/protocol'

/** 줄넘기에서 한 번 이상 의심 기록이 남은 회원. 수는 모두 판 수다. */
export interface JumpRopeSuspect {
  userId: string
  nickname: string
  withdrawn: boolean
  flaggedRounds: number
  duplicateRounds: number
  steadyRounds: number
  auditedRounds: number
  outsideParkRounds: number
  bestScore: number | null
  lowestJitterUs: number | null
  firstFlaggedAt: string
  lastFlaggedAt: string
}
/** 같은 점프 기록이 두 번 이상 제출된 묶음. 기록 저장을 시작하기 전의 판도 포함한다. */
export interface JumpRopeDuplicateLog {
  inputHash: string
  rounds: number
  members: number
  userIds: string[]
  score: number
  firstCompletedAt: string
  lastCompletedAt: string
}
export interface JumpRopeMacroReport {
  enabled: boolean
  limit: number
  suspects: JumpRopeSuspect[]
  duplicateLogs: JumpRopeDuplicateLog[]
  generatedAt: string
}

export class AdminJumpRopeMacroError extends Error {
  constructor(message: string, readonly kind: 'unauthenticated' | 'forbidden' | 'not_ready' | 'failed') { super(message) }
}

const invalid = (): never => {
  throw new AdminJumpRopeMacroError('줄넘기 기록 응답을 확인하지 못했습니다. 다시 조회해주세요.', 'failed')
}
const count = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0
const instant = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value))
const memberId = (value: unknown): value is string => typeof value === 'string' && /^[1-9]\d{0,18}$/.test(value)
const optionalCount = (value: unknown): value is number | null => value === null || count(value)

/** 서버 계약만 받아들인다. 형식이 어긋난 응답을 빈 목록처럼 보여주지 않는다. */
export function parseJumpRopeMacroReport(value: unknown): JumpRopeMacroReport {
  if (!record(value) || typeof value.enabled !== 'boolean' || !count(value.limit) || value.limit < 1
    || !Array.isArray(value.suspects) || value.suspects.length > value.limit
    || !Array.isArray(value.duplicateLogs) || value.duplicateLogs.length > 200 || !instant(value.generatedAt)) return invalid()
  const seen = new Set<string>()
  const suspects = value.suspects.map((item): JumpRopeSuspect => {
    if (!record(item) || !memberId(item.userId) || seen.has(item.userId)
      || typeof item.nickname !== 'string' || item.nickname.length > 40 || typeof item.withdrawn !== 'boolean'
      || !count(item.flaggedRounds) || item.flaggedRounds < 1 || !count(item.duplicateRounds) || !count(item.steadyRounds)
      || item.duplicateRounds > item.flaggedRounds || item.steadyRounds > item.flaggedRounds
      || !count(item.auditedRounds) || item.auditedRounds < item.flaggedRounds
      || !count(item.outsideParkRounds) || item.outsideParkRounds > item.auditedRounds
      || !optionalCount(item.bestScore) || !optionalCount(item.lowestJitterUs)
      || !instant(item.firstFlaggedAt) || !instant(item.lastFlaggedAt)
      || Date.parse(item.firstFlaggedAt) > Date.parse(item.lastFlaggedAt)) return invalid()
    seen.add(item.userId)
    return { userId: item.userId, nickname: item.nickname, withdrawn: item.withdrawn, flaggedRounds: item.flaggedRounds,
      duplicateRounds: item.duplicateRounds, steadyRounds: item.steadyRounds, auditedRounds: item.auditedRounds,
      outsideParkRounds: item.outsideParkRounds, bestScore: item.bestScore, lowestJitterUs: item.lowestJitterUs,
      firstFlaggedAt: item.firstFlaggedAt, lastFlaggedAt: item.lastFlaggedAt }
  })
  const hashes = new Set<string>()
  const duplicateLogs = value.duplicateLogs.map((item): JumpRopeDuplicateLog => {
    if (!record(item) || typeof item.inputHash !== 'string' || !/^[0-9a-f]{64}$/.test(item.inputHash) || hashes.has(item.inputHash)
      || !count(item.rounds) || item.rounds < 2 || !count(item.members) || item.members < 1 || item.members > item.rounds
      || !Array.isArray(item.userIds) || item.userIds.length < 1 || item.userIds.length > 10 || !item.userIds.every(memberId)
      || !count(item.score) || !instant(item.firstCompletedAt) || !instant(item.lastCompletedAt)
      || Date.parse(item.firstCompletedAt) > Date.parse(item.lastCompletedAt)) return invalid()
    hashes.add(item.inputHash)
    return { inputHash: item.inputHash, rounds: item.rounds, members: item.members, userIds: item.userIds as string[],
      score: item.score, firstCompletedAt: item.firstCompletedAt, lastCompletedAt: item.lastCompletedAt }
  })
  return { enabled: value.enabled, limit: value.limit, suspects, duplicateLogs, generatedAt: value.generatedAt }
}

export async function loadJumpRopeMacroReport(signal: AbortSignal): Promise<JumpRopeMacroReport> {
  let owner = getAuthSession()
  if (owner?.status !== 'AUTHENTICATED') throw new AdminJumpRopeMacroError('다시 로그인해주세요.', 'unauthenticated')
  const current = () => !signal.aborted && getAuthSession() === owner
  const fetchOnce = () => fetch('/api/v1/admin/macro-analysis/jump-rope', {
    method: 'GET', credentials: 'omit', cache: 'no-store',
    signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
    headers: { Authorization: `Bearer ${owner!.status === 'AUTHENTICATED' ? owner!.accessToken : ''}` },
  })

  let response = await fetchOnce()
  if (!current()) throw new Error('조회가 취소되었습니다.')
  if (response.status === 401) {
    const restored = await restoreAuthSession(true)
    if (signal.aborted) throw new Error('조회가 취소되었습니다.')
    if (!restored) throw new AdminJumpRopeMacroError('로그인이 만료되었습니다. 다시 로그인해주세요.', 'unauthenticated')
    owner = getAuthSession()
    if (owner?.status !== 'AUTHENTICATED') throw new AdminJumpRopeMacroError('다시 로그인해주세요.', 'unauthenticated')
    response = await fetchOnce()
  }
  if (!current()) throw new Error('조회가 취소되었습니다.')
  if (response.status === 401) throw new AdminJumpRopeMacroError('로그인이 만료되었습니다. 다시 로그인해주세요.', 'unauthenticated')
  if (response.status === 403) throw new AdminJumpRopeMacroError('줄넘기 기록 조회 권한이 없습니다. 관리자 등록을 확인해주세요.', 'forbidden')
  if (response.status === 404) throw new AdminJumpRopeMacroError('줄넘기 기록 API가 아직 배포되지 않았습니다.', 'not_ready')
  if (response.status === 503) throw new AdminJumpRopeMacroError('줄넘기 기록 테이블을 아직 읽을 수 없습니다. 서버 배포 상태를 확인해주세요.', 'not_ready')
  if (!response.ok) throw new AdminJumpRopeMacroError('줄넘기 기록을 가져오지 못했습니다. 다시 조회해주세요.', 'failed')
  const body: unknown = await response.json().catch(() => null)
  if (!current()) throw new Error('조회가 취소되었습니다.')
  return parseJumpRopeMacroReport(body)
}

/** 박자 흔들림을 ms 소수 한 자리로 보여준다. 점프가 적어 재지 못한 회원은 표시하지 않는다. */
export const jitterMs = (jitterUs: number | null): string => jitterUs === null ? '-' : `${(jitterUs / 1000).toFixed(1)}ms`
