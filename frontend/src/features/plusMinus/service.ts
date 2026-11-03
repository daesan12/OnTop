import { parsePlusMinusState, type PlusMinusState } from './protocol'

type RequestJSON = (path: string, init?: RequestInit) => Promise<unknown>
type PendingStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
const BASE = '/api/v1/minigames/plus-minus'
const KEY = /^[A-Za-z0-9_-]{1,64}$/

export class PlusMinusError extends Error {
  constructor(message: string, readonly retryable: boolean, readonly code = '') { super(message) }
}

const MESSAGES: Record<string, string> = {
  INSUFFICIENT_COINS: '엽전이 부족해요. 참가비 30냥이 필요해요.',
  PLUS_MINUS_DAILY_LIMIT: '오늘 10판을 모두 했어요. 내일 다시 만나요.',
  WALLET_NOT_READY: '지갑을 확인한 뒤 다시 시작해 주세요.',
}

function failure(error: unknown) {
  const status = typeof error === 'object' && error !== null && 'status' in error ? Number(error.status) : 0
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : ''
  // 4xx 업무 거절만 확정 실패다. 연결·5xx·형식 오류는 이미 반영됐을 수 있어 같은 요청으로 다시 확인한다.
  const decided = status >= 400 && status < 500
  return new PlusMinusError(MESSAGES[code] ?? (decided ? '요청이 승인되지 않았어요. 게임기 상태를 확인해 주세요.'
    : '응답을 확인하지 못했어요. 게임기 상태를 다시 확인해 주세요.'), !decided, code)
}

/** 서버 판 정산. START 요청 키를 저장해 응답 유실 후 재확인해도 두 번 차감되지 않게 한다. */
export class PlusMinusService {
  constructor(private readonly request: RequestJSON, private readonly context: {
    owner: () => string
    storage: () => PendingStorage
    newKey: () => string
  }) {}

  private async call(path: string, init?: RequestInit) {
    try { return parsePlusMinusState(await this.request(BASE + path, init)) } catch (error) {
      if (error instanceof PlusMinusError) throw error
      throw failure(error)
    }
  }

  status(): Promise<PlusMinusState> { return this.call('/status') }

  async start(): Promise<PlusMinusState> {
    const owner = this.context.owner()
    if (!owner) throw new PlusMinusError('공원 연결을 확인해 주세요.', false)
    const storageKey = `ontop:plus-minus:pending-start:${owner}`
    let storage: PendingStorage, key: string
    try {
      storage = this.context.storage()
      const saved = storage.getItem(storageKey)
      key = saved && KEY.test(saved) ? saved : this.context.newKey()
      if (!KEY.test(key)) throw new Error('invalid key')
      // POST 전에 저장한다. 응답을 잃어도 새로고침 후 같은 키로 확인해 다시 차감하지 않는다.
      storage.setItem(storageKey, key)
    } catch {
      throw new PlusMinusError('중복 차감을 막기 위한 브라우저 저장 공간을 확인해 주세요. 엽전은 차감되지 않았어요.', false)
    }
    try {
      const state = await this.call('/rounds', { method: 'POST', headers: { 'Idempotency-Key': key } })
      storage.removeItem(storageKey)
      return state
    } catch (error) {
      if (error instanceof PlusMinusError && !error.retryable) storage.removeItem(storageKey)
      throw error
    }
  }
}
