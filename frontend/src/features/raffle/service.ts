import { parseCurrent, parsePurchase, type RaffleCurrent, type RafflePurchase } from './protocol'

type RequestJSON = (path: string, init?: RequestInit) => Promise<unknown>
type PendingStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
const BASE = '/api/v1/raffles/current'
const KEY = /^[A-Za-z0-9_-]{1,64}$/

export class RaffleError extends Error {
  constructor(message: string, readonly retryable: boolean, readonly code = '') { super(message) }
}

const MESSAGES: Record<string, string> = {
  RAFFLE_SALES_CLOSED: '지금은 뽑기권 판매 시간이 아니에요. 매주 월요일 오전 9시에 판매가 시작돼요.',
  RAFFLE_WEEKLY_LIMIT_REACHED: '이번 주 뽑기권을 모두 뽑았어요. 다음 주에 다시 만나요.',
  INSUFFICIENT_BALANCE: '사용 가능한 엽전이 부족해요. 경기 참가금으로 예약된 엽전은 쓸 수 없어요.',
  WALLET_NOT_READY: '지갑이 아직 준비되지 않았어요. 잠시 후 다시 확인해 주세요.',
  RAFFLE_NUMBERS_EXHAUSTED: '이번 주 응모 번호가 모두 나갔어요. 다음 주에 다시 만나요.',
  RAFFLE_NOT_CONFIGURED: '복권방이 아직 준비 중이에요. 잠시 후 다시 확인해 주세요.',
  RAFFLE_UNAVAILABLE: '응모 정보를 잠시 확인할 수 없어요. 다시 확인해 주세요.',
}

function failure(error: unknown) {
  const status = typeof error === 'object' && error !== null && 'status' in error ? Number(error.status) : 0
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : ''
  // 4xx 업무 거절과 미설정은 차감되지 않은 확정 실패다. 연결·5xx·형식 오류는 같은 키로 다시 확인한다.
  const decided = status >= 400 && status < 500 || code === 'RAFFLE_NOT_CONFIGURED'
  return new RaffleError(MESSAGES[code] ?? (status === 401 || status === 403 ? '로그인을 다시 확인해 주세요.'
    : status === 404 ? '복권방이 아직 준비 중이에요. 잠시 후 다시 확인해 주세요.'
      : decided ? '요청이 승인되지 않았어요. 응모 상태를 확인해 주세요.'
        : '응답을 확인하지 못했어요. 잠시 후 다시 확인해 주세요.'), !decided, code)
}

/** 구매 키를 POST 전에 저장해 응답을 잃어도 같은 키로 확인하고 두 번 차감하지 않는다. */
export class RaffleService {
  constructor(private readonly request: RequestJSON, private readonly context: {
    owner: () => string
    storage: () => PendingStorage
    newKey: () => string
  }) {}

  private async call<T>(parse: (v: unknown) => T, init?: RequestInit, path = '') {
    try { return parse(await this.request(BASE + path, { cache: 'no-store', ...init })) } catch (error) {
      if (error instanceof RaffleError) throw error
      throw failure(error)
    }
  }

  current(): Promise<RaffleCurrent> { return this.call(parseCurrent) }

  async purchase(): Promise<RafflePurchase> {
    const owner = this.context.owner()
    if (!owner) throw new RaffleError('공원 연결을 확인해 주세요.', false)
    const storageKey = `ontop:raffle:pending-purchase:${owner}`
    let storage: PendingStorage, key: string
    try {
      storage = this.context.storage()
      const saved = storage.getItem(storageKey)
      key = saved && KEY.test(saved) ? saved : this.context.newKey()
      if (!KEY.test(key)) throw new Error('invalid key')
      storage.setItem(storageKey, key)
    } catch {
      throw new RaffleError('중복 차감을 막기 위한 브라우저 저장 공간을 확인해 주세요. 엽전은 차감되지 않았어요.', false)
    }
    try {
      const receipt = await this.call(parsePurchase, { method: 'POST', headers: { 'Idempotency-Key': key } }, '/tickets')
      storage.removeItem(storageKey)
      return receipt
    } catch (error) {
      if (error instanceof RaffleError && !error.retryable) storage.removeItem(storageKey)
      throw error
    }
  }
}
