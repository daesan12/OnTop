import { parseRpsState, type RpsState } from './protocol'
import type { Hand } from './ledHands'

type RequestJSON = (path: string, init?: RequestInit) => Promise<unknown>
type PendingStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
const BASE = '/api/v1/minigames/rps-roulette'
const KEY = /^[A-Za-z0-9_-]{1,64}$/

export class RpsRouletteError extends Error {
  constructor(message: string, readonly retryable: boolean, readonly code = '') { super(message) }
}

const MESSAGES: Record<string, string> = {
  INSUFFICIENT_COINS: '엽전이 부족해요. 참가비를 확인해 주세요.',
  RPS_DAILY_LIMIT: '오늘 15판을 모두 했어요. 내일 다시 만나요.',
  RPS_ROUND_IN_PROGRESS: '진행 중인 판이 있어요. 판 상태를 다시 불러올게요.',
  RPS_INVALID_PHASE: '지금은 할 수 없는 행동이에요. 판 상태를 다시 불러올게요.',
  WALLET_NOT_READY: '지갑을 확인한 뒤 다시 시작해 주세요.',
  RPS_ROUND_NOT_FOUND: '판을 찾지 못했어요.',
}

function failure(error: unknown) {
  const status = typeof error === 'object' && error !== null && 'status' in error ? Number(error.status) : 0
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : ''
  // 4xx 업무 거절만 확정 실패다. 연결·5xx·형식 오류는 이미 반영됐을 수 있어 같은 요청으로 다시 확인한다.
  const decided = status >= 400 && status < 500
  return new RpsRouletteError(MESSAGES[code] ?? (decided ? '요청이 승인되지 않았어요. 판 상태를 확인해 주세요.'
    : '응답을 확인하지 못했어요. 판 상태를 다시 확인해 주세요.'), !decided, code)
}

/** 서버 판 진행. START만 요청 키를 저장해 응답 유실 후 재확인해도 두 번 차감되지 않게 한다. */
export class RpsRouletteService {
  constructor(private readonly request: RequestJSON, private readonly context: {
    owner: () => string
    storage: () => PendingStorage
    newKey: () => string
  }) {}

  private async call(path: string, init?: RequestInit) {
    try { return parseRpsState(await this.request(BASE + path, init)) } catch (error) {
      if (error instanceof RpsRouletteError) throw error
      throw failure(error)
    }
  }

  private post(path: string, body: unknown, headers: Record<string, string> = {}) {
    return this.call(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) })
  }

  status(): Promise<RpsState> { return this.call('/status') }

  async start(fee: number): Promise<RpsState> {
    const owner = this.context.owner()
    if (!owner) throw new RpsRouletteError('공원 연결을 확인해 주세요.', false)
    const storageKey = `ontop:rps-roulette:pending-start:${owner}`
    let storage: PendingStorage, key: string
    try {
      storage = this.context.storage()
      const saved = storage.getItem(storageKey)
      const [savedFee, savedKey] = saved?.split(':') ?? []
      key = saved && Number(savedFee) === fee && KEY.test(savedKey ?? '') ? savedKey! : this.context.newKey()
      if (!KEY.test(key)) throw new Error('invalid key')
      // POST 전에 저장한다. 응답을 잃어도 새로고침 후 같은 키로 확인해 다시 차감하지 않는다.
      storage.setItem(storageKey, `${fee}:${key}`)
    } catch {
      throw new RpsRouletteError('중복 차감을 막기 위한 브라우저 저장 공간을 확인해 주세요. 엽전은 차감되지 않았어요.', false)
    }
    try {
      const state = await this.post('/rounds', { fee }, { 'Idempotency-Key': key })
      storage.removeItem(storageKey)
      return state
    } catch (error) {
      if (error instanceof RpsRouletteError && !error.retryable) storage.removeItem(storageKey)
      throw error
    }
  }

  hand(roundId: string, seq: number, hand: Hand) { return this.post(`/rounds/${roundId}/hands`, { seq, hand }) }
  challenge(roundId: string, seq: number) { return this.post(`/rounds/${roundId}/challenge`, { seq }) }
  stop(roundId: string, seq: number) { return this.post(`/rounds/${roundId}/stop`, { seq }) }
}
