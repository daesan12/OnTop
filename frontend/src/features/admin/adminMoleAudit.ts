import { getAuthSession, restoreAuthSession } from '../../auth/authFlow'
import type { MoleGame, MoleInput, MoleOutcome } from '../arcade/moleObservations'
import { AdminAccessError } from './adminAccess'

export type { MoleGame, MoleInput }

export interface AuditRound {
  roundId: string
  userId: string
  startedAt: string
  status: string
  observedTaps: number
  honeypotTaps: number
  completionHoneypotTaps: number
}

interface AuditEntry {
  sequence: number
  clientAtMs: number
  hole: number
  input: MoleInput
  outcome: MoleOutcome | 'HONEYPOT'
  spawnId: number | null
  appearedAtMs: number | null
  receivedAt: string
}

export interface Distribution {
  count: number
  median: number | null
  p10: number | null
  p90: number | null
}

interface Comparison {
  rounds: number
  honeypotTaps: number
  completionHoneypotTaps: number
  first: Distribution
  rapid: Distribution
}

export interface TimingSegment {
  samples: number
  medianMs: number | null
  spreadMs: number | null
  pace?: { taps: number; hits: number; p90IntervalMs: number | null; qualifies: boolean }
}

/** 판 확정 때 서버가 남긴 타이밍 신호. 기능 배포 전 판이나 확정되지 않은 판은 null이다. */
export interface AuditTiming {
  reactions: number
  medianReactionMs: number | null
  segments: TimingSegment[]
  fastReaction: boolean
  steady: boolean
  sustainedPace?: boolean | null
  recordedAt: string
}

export interface AuditDetail {
  selected: AuditRound
  nickname: string | null
  withdrawn: boolean
  timeline: AuditEntry[]
  recent: AuditRound[]
  member: Comparison
  reference: Comparison
  timing: AuditTiming | null
}

export interface AuditFilters {
  game: MoleGame
  input: MoleInput
  userId: string
  roundId: string
  date: string
}

export interface MoleDetectedMember {
  userId: string
  nickname: string | null
  withdrawn: boolean
  flaggedRounds: number
  liveRounds: number
  completionRounds: number
  latestRoundId: string
  lastDetectedAt: string
}

export interface MoleDetections {
  items: MoleDetectedMember[]
  from: string
  until: string
  limit: number
}

export interface MoleTimingMember {
  userId: string
  nickname: string | null
  withdrawn: boolean
  flaggedRounds: number
  fastRounds: number
  steadyRounds: number
  sustainedPaceRounds?: number
  auditedRounds: number
  lowestMedianReactionMs: number | null
  latestRoundId: string
  lastDetectedAt: string
}

export interface MoleTimingDetections {
  items: MoleTimingMember[]
  from: string
  until: string
  limit: number
}

/** 적발 목록에서 판 상세를 열 때 쓰는 공통 정보. */
export type MoleDetectionLink = Pick<MoleDetectedMember, 'userId' | 'latestRoundId' | 'lastDetectedAt'>

/** 서버 MoleTimingSignals와 같은 기준값. 운영자 화면의 설명에만 쓴다. */
export const moleTimingCriteria = {
  fastMedianMs: 150,
  fastMinReactions: 20,
  sustainedPace: { label: '지속 고속 적중', hits: 140, accuracyPercent: 97, p90Ms: 180 },
  'whack-a-mole': { segmentSeconds: 30, minSamples: 8, steadyMs: 12, steadyLabel: '구간 내 일정한 반응', sample: '반응 시간' },
  'speed-mole': { segmentSeconds: 20, minSamples: 10, steadyMs: 8, steadyLabel: '구간 내 일정한 간격', sample: '타격 간격' },
} as const

export function timingSegmentLabel(game: MoleGame, index: number) {
  const seconds = moleTimingCriteria[game].segmentSeconds
  return `${index + 1}구간 (${index * seconds}–${(index + 1) * seconds}초)`
}

const BASE = '/api/v1/admin/macro-analysis/mole'

async function request<T>(path: string, signal: AbortSignal): Promise<T> {
  let owner = getAuthSession()
  const send = (token: string) => fetch(path, {
    credentials: 'omit', cache: 'no-store', signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
    headers: { Authorization: `Bearer ${token}` },
  })
  const unauthenticated = () => new AdminAccessError('다시 로그인해주세요.', 'unauthenticated')
  if (owner?.status !== 'AUTHENTICATED') throw unauthenticated()
  let response = await send(owner.accessToken)
  if (signal.aborted || owner !== getAuthSession()) throw new Error('조회가 취소되었습니다.')
  if (response.status === 401) {
    if (!await restoreAuthSession(true)) throw unauthenticated()
    signal.throwIfAborted()
    owner = getAuthSession()
    if (owner?.status !== 'AUTHENTICATED') throw unauthenticated()
    response = await send(owner.accessToken)
  }
  if (signal.aborted || owner !== getAuthSession()) throw new Error('조회가 취소되었습니다.')
  if (response.status === 401) throw unauthenticated()
  if (response.status === 403) throw new Error('관리자 조회 권한이 필요합니다.')
  if (!response.ok) throw new Error('두더지 기록을 가져오지 못했습니다. 조회 조건을 확인하고 다시 시도해주세요.')
  const result = await response.json() as T
  if (signal.aborted || owner !== getAuthSession()) throw new Error('조회가 취소되었습니다.')
  return result
}

export function searchMoleAudit(filters: AuditFilters, signal: AbortSignal) {
  const { game, userId, roundId, date } = filters
  const query = new URLSearchParams({ game })
  if (userId) query.set('userId', userId)
  if (roundId) query.set('roundId', roundId)
  if (date) query.set('date', date)
  return request<AuditRound[]>(`${BASE}?${query}`, signal)
}

export function readMoleAudit(game: MoleGame, roundId: string, input: MoleInput, signal: AbortSignal) {
  const query = new URLSearchParams({ game, input })
  return request<AuditDetail>(`${BASE}/${encodeURIComponent(roundId)}?${query}`, signal)
}

export function readMoleDetections(game: MoleGame, signal: AbortSignal) {
  return request<MoleDetections>(`${BASE}/detections?${new URLSearchParams({ game })}`, signal)
}

export function readMoleTimingDetections(game: MoleGame, signal: AbortSignal) {
  return request<MoleTimingDetections>(`${BASE}/timing?${new URLSearchParams({ game })}`, signal)
}
