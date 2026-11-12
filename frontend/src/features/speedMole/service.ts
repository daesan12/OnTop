import { SPEED_MOLE_POINTS_PER_COIN } from './game'
import { parkRuntime } from '../../park/runtime/runtime'

const BASE = '/api/v1/minigames/speed-mole'
export interface SpeedMoleSession { id: string; seed: number; rulesVersion: number; serverNow: string; startedAt: string; durationMs: number }
export interface SpeedMoleTap { hole: number; at: number }
export interface SpeedMoleResult { id: string; rulesVersion: number; score: number; hits: number; misses: number; completedAt: string; calculatedReward: number; reward: number; todayEarned: number; dailyCap: number }
export interface SpeedMoleRankingItem { rank: number; userId: string; nickname: string; score: number; hits: number; misses: number; completedAt: string }
export interface SpeedMoleRankings { rulesVersion: number; period: string; totalParticipants: number; offset: number; limit: number; items: SpeedMoleRankingItem[]; me: SpeedMoleRankingItem | null; hasMore: boolean }
export class SpeedMoleError extends Error {
  constructor(message: string, readonly code = '') { super(message) }
}
const messages: Record<string, string> = {
  SPEED_MOLE_UNAVAILABLE: '기록 서버가 아직 준비되지 않았어요. 잠시 후 다시 확인해 주세요.',
  SPEED_MOLE_NOT_FINISHED: '서버의 경기 시간이 끝나지 않았어요. 잠시 후 기록 저장을 다시 눌러주세요.',
  SPEED_MOLE_ROUND_EXPIRED: '기록 제출 시간이 지났어요. 이번 판은 랭킹에 저장되지 않았어요.',
  SPEED_MOLE_ROUND_FINISHED: '이미 완료된 시작 요청이에요. 다시 시작해 주세요.',
  SPEED_MOLE_INVALID_TAPS: '타격 기록을 확인하지 못했어요. 이번 판은 저장되지 않았어요.',
  SPEED_MOLE_ROUND_SUPERSEDED: '다른 창에서 새 판을 시작했어요. 새로 시작해 주세요.',
  WALLET_NOT_READY: '지갑을 확인한 뒤 다시 시작해 주세요.',
}
type Request = (path: string, init?: RequestInit) => Promise<unknown>
function rankingItem(value: unknown): value is SpeedMoleRankingItem {
  if (typeof value !== 'object' || value === null) return false
  const item = value as SpeedMoleRankingItem
  return typeof item.userId === 'string' && /^[1-9][0-9]{0,18}$/.test(item.userId)
    && typeof item.nickname === 'string' && item.nickname.length > 0
    && Number.isSafeInteger(item.rank) && item.rank > 0
    && [item.score, item.hits, item.misses].every(n => Number.isInteger(n) && n >= 0)
    && item.score <= item.hits && item.hits + item.misses <= 6000 && Number.isFinite(Date.parse(item.completedAt))
}
export class SpeedMoleService {
  constructor(private readonly request: Request = parkRuntime.requestJSON) {}
  private async call(path: string, init?: RequestInit) {
    try { return await this.request(BASE + path, init) } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : ''
      throw new SpeedMoleError(messages[code] ?? '서버 응답을 확인하지 못했어요. 같은 요청으로 다시 확인해 주세요.', code)
    }
  }
  async start(key: string): Promise<SpeedMoleSession> {
    const value = await this.call('/rounds', { method: 'POST', headers: { 'Idempotency-Key': key } }) as SpeedMoleSession
    if (!value || typeof value.id !== 'string' || !/^[1-9][0-9]{0,18}$/.test(value.id) || !Number.isInteger(value.seed) || value.seed < 0 || value.seed > 0xffffffff
      || value.rulesVersion !== 1 || value.durationMs !== 60000 || !Number.isFinite(Date.parse(value.serverNow))
      || !Number.isFinite(Date.parse(value.startedAt))) throw new SpeedMoleError('경기 규칙 응답을 확인하지 못했어요.')
    return value
  }
  async complete(id: string, taps: readonly SpeedMoleTap[]): Promise<SpeedMoleResult> {
    const value = await this.call(`/rounds/${encodeURIComponent(id)}/complete`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ taps }),
    }) as SpeedMoleResult
    if (!value || value.id !== id || value.rulesVersion !== 1 || ![value.score, value.hits, value.misses].every(n => Number.isInteger(n) && n >= 0)
      || value.score > value.hits || !Number.isFinite(Date.parse(value.completedAt))
      || ![value.calculatedReward,value.reward,value.todayEarned,value.dailyCap].every(n=>Number.isSafeInteger(n)&&n>=0)
      || value.calculatedReward !== Math.floor(value.score / SPEED_MOLE_POINTS_PER_COIN) || value.reward > value.calculatedReward || value.reward > value.dailyCap || value.dailyCap !== 1000)
      throw new SpeedMoleError('저장 응답을 확인하지 못했어요. 다시 확인해 주세요.')
    return value
  }
  async rankings(offset = 0): Promise<SpeedMoleRankings> {
    const value = await this.call(`/rankings?limit=20&offset=${offset}`) as SpeedMoleRankings
    if (!value || value.rulesVersion !== 1 || value.period !== 'ALL_TIME' || !Array.isArray(value.items)
      || !value.items.every(rankingItem) || (value.me !== null && !rankingItem(value.me)) || typeof value.hasMore !== 'boolean'
      || !Number.isSafeInteger(value.totalParticipants) || value.totalParticipants < 0 || value.offset !== offset || value.limit !== 20)
      throw new SpeedMoleError('랭킹 응답을 확인하지 못했어요.')
    return value
  }
}
export const speedMoleService = new SpeedMoleService()
