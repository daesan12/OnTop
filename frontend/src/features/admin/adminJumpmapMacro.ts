import { getAuthSession, restoreAuthSession } from '../../auth/authFlow'
import { record } from '../../network/protocol'

/** 점프맵 반복 패턴으로 한 번 이상 기록된 회원. 적발 수는 판 수다. */
export interface MacroSuspect {
  userId: string
  nickname: string
  withdrawn: boolean
  flaggedRuns: number
  replayRuns: number
  fixedStartRuns: number
  totalRuns: number
  bestFinishMs: number | null
  firstDetectedAt: string
  lastDetectedAt: string
}
export interface MacroSuspectList { enabled: boolean; limit: number; items: MacroSuspect[]; generatedAt: string }

export class AdminJumpmapMacroError extends Error {
  constructor(message: string, readonly kind: 'unauthenticated' | 'forbidden' | 'not_ready' | 'failed') { super(message) }
}

const invalid = (): never => {
  throw new AdminJumpmapMacroError('적발 목록 응답을 확인하지 못했습니다. 다시 조회해주세요.', 'failed')
}
const count = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0
const instant = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value))

/** 서버 계약만 받아들인다. 형식이 어긋난 응답을 빈 목록처럼 보여주지 않는다. */
export function parseMacroSuspects(value: unknown): MacroSuspectList {
  if (!record(value) || typeof value.enabled !== 'boolean' || !count(value.limit) || value.limit < 1
    || !Array.isArray(value.items) || value.items.length > value.limit || !instant(value.generatedAt)) return invalid()
  const seen = new Set<string>()
  const items = value.items.map((item): MacroSuspect => {
    if (!record(item) || typeof item.userId !== 'string' || !/^[1-9]\d{0,18}$/.test(item.userId) || seen.has(item.userId)
      || typeof item.nickname !== 'string' || item.nickname.length > 40 || typeof item.withdrawn !== 'boolean'
      || !count(item.flaggedRuns) || item.flaggedRuns < 1 || !count(item.replayRuns) || !count(item.fixedStartRuns)
      || item.replayRuns > item.flaggedRuns || item.fixedStartRuns > item.flaggedRuns
      || !count(item.totalRuns) || item.totalRuns < item.flaggedRuns
      || !(item.bestFinishMs === null || count(item.bestFinishMs) && item.bestFinishMs > 0)
      || !instant(item.firstDetectedAt) || !instant(item.lastDetectedAt)
      || Date.parse(item.firstDetectedAt) > Date.parse(item.lastDetectedAt)) return invalid()
    seen.add(item.userId)
    return { userId: item.userId, nickname: item.nickname, withdrawn: item.withdrawn, flaggedRuns: item.flaggedRuns,
      replayRuns: item.replayRuns, fixedStartRuns: item.fixedStartRuns, totalRuns: item.totalRuns,
      bestFinishMs: item.bestFinishMs as number | null, firstDetectedAt: item.firstDetectedAt,
      lastDetectedAt: item.lastDetectedAt }
  })
  return { enabled: value.enabled, limit: value.limit, items, generatedAt: value.generatedAt }
}

export async function loadMacroSuspects(signal: AbortSignal): Promise<MacroSuspectList> {
  let owner = getAuthSession()
  if (owner?.status !== 'AUTHENTICATED') throw new AdminJumpmapMacroError('다시 로그인해주세요.', 'unauthenticated')
  const current = () => !signal.aborted && getAuthSession() === owner
  const fetchOnce = () => fetch('/api/v1/admin/macro-analysis/jumpmap', {
    method: 'GET', credentials: 'omit', cache: 'no-store',
    signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
    headers: { Authorization: `Bearer ${owner!.status === 'AUTHENTICATED' ? owner!.accessToken : ''}` },
  })

  let response = await fetchOnce()
  if (!current()) throw new Error('조회가 취소되었습니다.')
  if (response.status === 401) {
    const restored = await restoreAuthSession(true)
    if (signal.aborted) throw new Error('조회가 취소되었습니다.')
    if (!restored) throw new AdminJumpmapMacroError('로그인이 만료되었습니다. 다시 로그인해주세요.', 'unauthenticated')
    owner = getAuthSession()
    if (owner?.status !== 'AUTHENTICATED') throw new AdminJumpmapMacroError('다시 로그인해주세요.', 'unauthenticated')
    response = await fetchOnce()
  }
  if (!current()) throw new Error('조회가 취소되었습니다.')
  if (response.status === 401) throw new AdminJumpmapMacroError('로그인이 만료되었습니다. 다시 로그인해주세요.', 'unauthenticated')
  if (response.status === 403) throw new AdminJumpmapMacroError('적발 목록 조회 권한이 없습니다. 관리자 등록을 확인해주세요.', 'forbidden')
  if (response.status === 404) throw new AdminJumpmapMacroError('적발 목록 API가 아직 배포되지 않았습니다.', 'not_ready')
  if (response.status === 503) throw new AdminJumpmapMacroError('적발 기록 테이블을 아직 읽을 수 없습니다. 서버 배포 상태를 확인해주세요.', 'not_ready')
  if (!response.ok) throw new AdminJumpmapMacroError('적발 목록을 가져오지 못했습니다. 다시 조회해주세요.', 'failed')
  const body: unknown = await response.json().catch(() => null)
  if (!current()) throw new Error('조회가 취소되었습니다.')
  return parseMacroSuspects(body)
}

/** 완주 기록을 소수점 세 자리 초로 보여준다(점프맵 결과 화면과 같은 단위). */
export const finishSeconds = (finishMs: number | null): string =>
  finishMs === null ? '없음' : `${(finishMs / 1000).toFixed(3)}초`

export const flaggedShare = (suspect: Pick<MacroSuspect, 'flaggedRuns' | 'totalRuns'>): string =>
  suspect.totalRuns === 0 ? '0%' : `${Math.round(100 * suspect.flaggedRuns / suspect.totalRuns)}%`
