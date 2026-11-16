import { parkRuntime } from '../../park/runtime/runtime'
import type { JumpRopeRankingState } from '../../jump-rope-preview/jumpRopeRankingData'
import type { RoundEndReason, RoundStats } from '../../jump-rope-preview/jumpRopeRules'

const base = '/api/v1/minigames/jump-rope'
/** 1: the original rope. 2: the grandpa raid with duck and stun. The server picks it per round. */
export type JumpRopeRulesVersion = 1 | 2
/** One held duck, [startUs, endUs] on the active play clock. */
export type JumpRopeDuckSpan = readonly [startUs: number, endUs: number]
export type JumpRopeSession = { id: string; seed: number; rulesVersion: JumpRopeRulesVersion; serverNow: string; startedAt: string; expiresAt: string; durationMs: 60000 }
export type JumpRopeReceipt = Pick<RoundStats, 'score' | 'counts'> & { id: string; rulesVersion: JumpRopeRulesVersion; endReason: RoundEndReason; completedAt: string; reward: number | null }
type Ranking = { rank: number; nickname: string; score: number }
type Request = typeof parkRuntime.requestJSON

const messages: Record<string, string> = {
  JUMP_ROPE_ROUND_EXPIRED: '기록 제출 시간이 지났어요. 새로 시작해 주세요.',
  JUMP_ROPE_ROUND_SUPERSEDED: '다른 판이 시작되어 이 기록을 제출할 수 없어요.',
  JUMP_ROPE_ROUND_FINISHED: '이미 완료된 시작 요청이에요. 다시 시작해 주세요.',
  JUMP_ROPE_ROUND_NOT_FOUND: '이 경기 기록을 찾을 수 없어요.',
  JUMP_ROPE_NOT_FINISHED: '서버의 경기 시간이 끝나지 않았어요. 잠시 후 다시 시도해 주세요.',
  JUMP_ROPE_INPUT_CONFLICT: '이미 다른 입력으로 확정된 경기예요.',
  JUMP_ROPE_INVALID_INPUTS: '서버가 점프·숙이기 기록을 확인하지 못했어요.',
}

export class JumpRopeApiError extends Error {
  constructor(readonly code: string, readonly retryable: boolean) {
    super(messages[code] ?? '서버 응답을 확인하지 못했어요. 다시 시도해 주세요.')
  }
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const integer = (value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max
const date = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value))
const roundId = (value: unknown): value is string => typeof value === 'string' && /^[1-9]\d{0,18}$/.test(value)
const rankingItem = (value: unknown): value is Ranking => isObject(value) && integer(value.rank, 1)
  && typeof value.nickname === 'string' && integer(value.score)
const rulesVersion = (value: unknown): value is JumpRopeRulesVersion => value === 1 || value === 2

export class JumpRopeService {
  constructor(private readonly request: Request = parkRuntime.requestJSON) {}

  private async call(path: string, init: RequestInit) {
    try { return await this.request(base + path, init) }
    catch (error) {
      const code = isObject(error) && typeof error.code === 'string' ? error.code : ''
      const status = isObject(error) && typeof error.status === 'number' ? error.status : undefined
      throw new JumpRopeApiError(code, code === 'JUMP_ROPE_NOT_FINISHED' || status === undefined || status >= 500 || status === 429)
    }
  }

  async start(key: string, signal: AbortSignal): Promise<JumpRopeSession> {
    const value = await this.call('/rounds', { method: 'POST', headers: { 'Idempotency-Key': key }, signal })
    if (!isObject(value) || !roundId(value.id) || !integer(value.seed, 0, 0xffffffff) || !rulesVersion(value.rulesVersion)
      || !date(value.serverNow) || !date(value.startedAt) || !date(value.expiresAt) || value.durationMs !== 60000
      || Date.parse(value.expiresAt) - Date.parse(value.startedAt) !== 95_000) throw new JumpRopeApiError('', true)
    return { id: value.id, seed: value.seed, rulesVersion: value.rulesVersion, serverNow: value.serverNow,
      startedAt: value.startedAt, expiresAt: value.expiresAt, durationMs: 60000 }
  }

  /**
   * A v1 round sends only the jump log. A v2 round must also send its duck log (possibly empty); the server
   * decides the rules from the round it stored, so the confirmed version must match the request shape.
   */
  async complete(id: string, jumpOffsetsUs: readonly number[], duckSpansUs?: readonly JumpRopeDuckSpan[]): Promise<JumpRopeReceipt> {
    const expected: JumpRopeRulesVersion = duckSpansUs ? 2 : 1
    const value = await this.call(`/rounds/${encodeURIComponent(id)}/complete`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(duckSpansUs ? { jumpOffsetsUs, duckSpansUs } : { jumpOffsetsUs }),
      // A stalled connection must not keep the operation gate waiting indefinitely.
      signal: AbortSignal.timeout(15_000),
    })
    if (!isObject(value) || value.id !== id || value.rulesVersion !== expected || !integer(value.score) || !date(value.completedAt)
      || (value.endReason !== 'time' && value.endReason !== 'missLimit') || !isObject(value.counts)) throw new JumpRopeApiError('', true)
    const { perfect, good, miss } = value.counts
    if (!integer(perfect) || !integer(good) || !integer(miss, 0, 3)
      || (miss === 3) !== (value.endReason === 'missLimit')) throw new JumpRopeApiError('', true)
    // Older servers omit the amount. Keep the confirmed record without inventing a reward.
    const reward = value.reward
    if (reward !== undefined && (!integer(reward) || (value.endReason === 'missLimit' && reward !== 0))) {
      throw new JumpRopeApiError('', true)
    }
    return { id, rulesVersion: expected, score: value.score, counts: { perfect, good, miss }, endReason: value.endReason,
      completedAt: value.completedAt, reward: reward ?? null }
  }

  /** The board of the version new rounds use; records of other versions stay on the server. */
  async rankings(signal: AbortSignal): Promise<JumpRopeRankingState> {
    const value = await this.call('/rankings', { method: 'GET', signal })
    if (!isObject(value) || !rulesVersion(value.rulesVersion) || value.period !== 'EVENT' || value.offset !== 0 || value.limit !== 10
      || !Array.isArray(value.items) || value.items.length > 10 || !value.items.every(rankingItem)
      || (value.me !== null && !rankingItem(value.me))) throw new JumpRopeApiError('', true)
    return { kind: 'ready', entries: value.items, personalBest: value.me ?? undefined, serverRanked: true }
  }
}

export const jumpRopeService = new JumpRopeService()
