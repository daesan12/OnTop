import { validDailyBudget } from '../minigameRewards'
import type { GrillLogEntry } from './rules'
import { BUNGEOPPANG as R } from './config'
import { parkRuntime } from '../../park/runtime/runtime'
import { RestError } from '../../network/restError'
import { record } from '../../network/protocol'
import type { BreadOrder, BungeoppangRules, GrillLogEntry as V4Log } from './rulesV4'
import { bungeoppangV4Preview, bungeoppangV5Preview, bungeoppangV5Enabled } from './config'
import { createBungeoppangV5Service } from './serviceV5'
import { createV5PreviewService } from './serviceV5Preview'
import type { CustomerOrder, GrillState as V5Grill } from './rulesV5'
import { createV4PreviewService } from './serviceV4Preview'
import { createBungeoppangV4Service, type V4Checkpoint } from './serviceV4'
import type { RoundTiming, ServerTimeSample } from './serverTime'

export interface BungeoppangStatus {
  todayEarned: number; dailyCap: number; isFirstGame: boolean; seenTips: string[]; rulesVersion: string
  activeSessionId?: string | null
}
export interface BungeoppangGame {
  gameId: string; startedAt: string; rulesVersion: string; heats: number[]; isFirstGame: boolean
  v4?: { configVersion?: string; order: BreadOrder; rules: Readonly<BungeoppangRules & { rulesVersion: 'v4' }>
    timing?: RoundTiming
    timeSync?: BungeoppangTimeSync
    checkpoint?: V4Checkpoint; grill?: import('./rulesV4').GrillState }
  v5?: { orders: CustomerOrder[]; rules: Readonly<BungeoppangRules>; grill?: V5Grill;
    timing?: RoundTiming; timeSync?: BungeoppangTimeSync }
}
export interface BungeoppangSubmit {
  gameId: string; log: (GrillLogEntry | V4Log)[]; seenTips: string[]; clientScore: number
  deliveryKey?: string; completeKey?: string
}
export interface BungeoppangSubmitResult {
  score: number; made: number; golden: number; failed: number; wasted: number; maxCombo: number
  coinsCalculated: number; coinsGranted: number; todayEarned: number; dailyCap: number; capReached: boolean
  successfulMade?: number; served?: number; customersServed?: number; specialServed?: number; bonusScore?: number
  grillDiscarded?: number; trayDiscarded?: number; undeliveredCount?: number; unfinishedGrillCount?: number
  rewardDate?: string; settledAt?: string; finalThroughSeq?: number; finalPrefixHash?: string
  rulesVersion?: string; configVersion?: string
}
export interface BungeoppangTimeSync {
  timing: RoundTiming
  sample: ServerTimeSample
  status: 'PLAYING' | 'COMPLETED' | 'ABANDONED' | 'INVALID'
  result?: BungeoppangSubmitResult
}
export class BungeoppangServiceError extends Error {
  constructor(readonly code: string, message: string, readonly retryable = false, readonly status = 0) { super(message) }
}
export interface BungeoppangService {
  readonly mock: boolean
  getStatus(): Promise<BungeoppangStatus>
  startGame(key: string): Promise<BungeoppangGame>
  /** Existing GET source/progress contract; never creates or restarts a round. */
  resumeGame?(gameId: string): Promise<BungeoppangGame>
  submitResult(request: BungeoppangSubmit): Promise<BungeoppangSubmitResult>
  abandon(gameId: string): Promise<void>
  balance(): Promise<number>
  /** FE internal port. Implement its transport only after the v4 BE contract is approved. */
  nextOrder?(request: BungeoppangSubmit): Promise<{ index: number; order: BreadOrder; checkpoint?: V4Checkpoint }>
  recoverV4?(gameId: string): Promise<{ grill: import('./rulesV4').GrillState; checkpoint: V4Checkpoint }>
  syncTimeV4?(gameId: string): Promise<BungeoppangTimeSync>
  setManualPaused?(gameId: string, paused: boolean): Promise<BungeoppangTimeSync | void>
  deliverV5?(request: BungeoppangSubmit): Promise<{ grill: V5Grill; revision: number }>
  recoverV5?(gameId: string): Promise<{ grill: V5Grill; revision: number }>
}
const tips = ['START', 'POUR', 'GOLD', 'BURNT', 'RUSH']
const whole = (n: unknown): n is number => Number.isSafeInteger(n) && Number(n) >= 0
const validId = (id: unknown): id is string => typeof id === 'string' && /^[1-9]\d{0,18}$/.test(id)
const invalid = (): never => { throw new BungeoppangServiceError('INVALID_RESPONSE', '서버 응답을 확인하지 못했어요. 같은 요청으로 다시 확인해 주세요.', true) }
/** Shared MINI-01~04 error copy. The v4 adapter falls back to it for codes it does not override. */
export const messages: Record<string, string> = {
  RULES_VERSION_MISMATCH: '게임 규칙이 변경됐어요. 새로고침 후 새 판을 시작해 주세요.',
  LOG_INVALID: '서버가 조리 기록을 승인하지 않았어요. 이번 판은 지급되지 않습니다.',
  TOO_EARLY: '서버의 완료 가능 시간을 기다린 뒤 같은 기록으로 다시 확인해 주세요.',
  TOO_MANY_STARTS: '시작 요청이 많아요. 잠시 후 다시 시도해 주세요.',
  MINIGAME_NOT_CONFIGURED: '붕어빵 서버 설정이 아직 준비되지 않았어요.',
  MINIGAME_UNAVAILABLE: '붕어빵 서버나 지갑을 잠시 사용할 수 없어요.',
  GAME_NOT_ACTIVE: '다른 창에서 시작했거나 만료된 판이에요. 새 판이 필요합니다.',
  MINIGAME_ALREADY_ABANDONED: '이미 그만둔 판이에요. 새 판이 필요합니다.',
  MINIGAME_ALREADY_INVALID: '이미 종료된 판이에요. 새 판이 필요합니다.',
  MINIGAME_NOT_FOUND: '본인 판을 찾을 수 없어요.',
  WALLET_NOT_READY: '계정의 지갑이 아직 준비되지 않았어요. 운영 담당자의 지갑 초기화가 필요합니다.',
  WALLET_UNAVAILABLE: '지갑 잔액을 조회하지 못했어요. 잠시 후 잔액을 다시 확인해 주세요.',
}
/** Existing MINI-01~04 REST contract only. No browser settlement or failure-to-mock fallback. */
export function createBungeoppangService(requestJSON: (path: string, init?: RequestInit) => Promise<unknown>): BungeoppangService {
  const path = '/api/v1/minigames/sessions'
  async function request(url: string, init: RequestInit = {}) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 12000)
    try { return await requestJSON(url, { ...init, signal: controller.signal }) }
    catch (error) {
      if (error instanceof BungeoppangServiceError) throw error
      if (error instanceof RestError) throw new BungeoppangServiceError(error.code,
        messages[error.code] ?? (error.status === 401 || error.status === 403 ? '로그인을 다시 확인해 주세요.' : error.message),
        error.status >= 500 || error.status === 429 || error.code === 'TOO_EARLY')
      throw new BungeoppangServiceError('NETWORK_ERROR', '서버 응답을 받지 못했어요. 같은 요청으로 다시 시도해 주세요.', true)
    } finally { clearTimeout(timer) }
  }
  const post = (body: unknown, headers: Record<string, string> = {}): RequestInit => ({
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
  })
  const sessionPath = (gameId: string) => { if (!validId(gameId)) return invalid(); return `${path}/${gameId}` }
  return {
    mock: false,
    async getStatus() {
      const p = await request(path)
      if (!record(p) || !whole(p.todayEarned) || !validDailyBudget(p.todayEarned, p.dailyCap)
        || typeof p.isFirstGame !== 'boolean' || !Array.isArray(p.seenTips) || p.seenTips.length > 5
        || !p.seenTips.every(v => typeof v === 'string' && tips.includes(v))) return invalid()
      if (p.rulesVersion !== R.rulesVersion) throw new BungeoppangServiceError('RULES_VERSION_MISMATCH', messages.RULES_VERSION_MISMATCH!)
      return { todayEarned: p.todayEarned, dailyCap: p.dailyCap, isFirstGame: p.isFirstGame, seenTips: [...p.seenTips], rulesVersion: R.rulesVersion }
    },
    async startGame(key) {
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(key)) return invalid()
      const p = await request(path, post({ minigameType: 'BUNGEOPPANG' }, { 'Idempotency-Key': key }))
      if (!record(p) || !validId(p.minigameSessionId) || p.minigameType !== 'BUNGEOPPANG' || p.status !== 'PLAYING'
        || typeof p.startedAt !== 'string' || !Number.isFinite(Date.parse(p.startedAt)) || typeof p.isFirstGame !== 'boolean'
        || !Array.isArray(p.heats) || p.heats.length !== R.heatListLength
        || !p.heats.every(h => whole(h) && h >= R.heatMin && h <= R.heatMax)) return invalid()
      if (p.rulesVersion !== R.rulesVersion) throw new BungeoppangServiceError('RULES_VERSION_MISMATCH', messages.RULES_VERSION_MISMATCH!)
      // Start receipts are idempotent, including after another tab has ended that session.
      const current = await request(sessionPath(p.minigameSessionId))
      if (!record(current) || current.minigameSessionId !== p.minigameSessionId) return invalid()
      if (current.status !== 'PLAYING') throw new BungeoppangServiceError('GAME_NOT_ACTIVE', messages.GAME_NOT_ACTIVE!)
      return { gameId: p.minigameSessionId, startedAt: p.startedAt, rulesVersion: R.rulesVersion, heats: [...p.heats] as number[], isFirstGame: p.isFirstGame }
    },
    async submitResult(input) {
      // Never send v4 records to the existing v2 completion API.
      if (input.log.some(e => !['POUR', 'FILL', 'TURN', 'DISCARD'].includes(e.action) || 'filling' in e || 'order' in e))
        throw new BungeoppangServiceError('RULES_VERSION_MISMATCH', messages.RULES_VERSION_MISMATCH!)
      const p = await request(sessionPath(input.gameId) + '/complete', post({ log: input.log, seenTips: input.seenTips, clientScore: input.clientScore }))
      const fields = ['score', 'made', 'golden', 'failed', 'wasted', 'maxCombo', 'coinsCalculated', 'coinsGranted', 'todayEarned'] as const
      if (!record(p) || p.minigameSessionId !== input.gameId || p.status !== 'COMPLETED'
        || !fields.every(k => whole(p[k])) || !validDailyBudget(p.todayEarned, p.dailyCap) || typeof p.capReached !== 'boolean'
        || Number(p.coinsGranted) > Number(p.coinsCalculated)
        || Number(p.coinsGranted) > Number(p.todayEarned) || p.rewardAmount !== p.coinsGranted || p.verifiedCompletedCount !== p.made) return invalid()
      return Object.fromEntries([...fields, 'dailyCap', 'capReached'].map(k => [k, p[k]])) as unknown as BungeoppangSubmitResult
    },
    async abandon(id) {
      const p = await request(sessionPath(id) + '/abandon', post({}))
      if (!record(p) || p.minigameSessionId !== id || p.status !== 'ABANDONED' || p.rewardAmount !== 0) return invalid()
    },
    async balance() {
      const p = await request('/api/v1/wallets/me', { cache: 'no-store' })
      if (!record(p) || !whole(p.balance) || !whole(p.reservedBalance) || !whole(p.availableBalance)
        || p.balance - p.reservedBalance !== p.availableBalance) return invalid()
      return p.balance
    },
  }
}
export const bungeoppangService: BungeoppangService = bungeoppangV5Preview ? createV5PreviewService()
  : bungeoppangV4Preview ? createV4PreviewService()
    : bungeoppangV5Enabled ? createBungeoppangV5Service((path, init) => parkRuntime.requestJSON(path, init))
      : createBungeoppangV4Service((path, init) => parkRuntime.requestJSON(path, init))
