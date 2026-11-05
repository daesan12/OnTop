import { parseMoleRound, parseMoleSettlement, parseMoleState, type Hit, type MoleRound, type MoleSettlement, type MoleState } from './protocol'

type RequestJSON = (path: string, init?: RequestInit) => Promise<unknown>
type PendingStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
const BASE = '/api/v1/minigames/whack-a-mole'
const KEY = /^[A-Za-z0-9_-]{1,64}$/

export class MoleError extends Error {
  constructor(message: string, readonly retryable: boolean, readonly code = '') { super(message) }
}

const MESSAGES: Record<string, string> = {
  WALLET_NOT_READY: '지갑을 확인한 뒤 다시 시작해 주세요.',
  MOLE_ROUND_EXPIRED: '시간이 지나 끝난 판이에요. 새로 시작해 주세요.',
  MOLE_ROUND_NOT_FINISHED: '아직 끝나지 않은 판이에요.',
  MOLE_ROUND_NOT_FOUND: '판을 찾을 수 없어요. 새로 시작해 주세요.',
}

function failure(error: unknown) {
  const status = typeof error === 'object' && error !== null && 'status' in error ? Number(error.status) : 0
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : ''
  // 4xx 업무 거절만 확정 실패다. 연결·5xx·형식 오류는 이미 반영됐을 수 있어 같은 요청으로 다시 확인한다.
  const decided = status >= 400 && status < 500
  return new MoleError(MESSAGES[code] ?? (decided ? '요청이 승인되지 않았어요. 게임기 상태를 확인해 주세요.'
    : '응답을 확인하지 못했어요. 잠시 뒤 다시 확인해 주세요.'), !decided, code)
}

export interface MolePort {
  status(): Promise<MoleState>
  start(): Promise<MoleRound>
  complete(roundId: string, hits: readonly Hit[]): Promise<MoleSettlement>
}

/** 서버 판. 시작 요청 키를 저장해 응답을 잃어도 같은 판을 다시 받고, 완료는 서버가 같은 결과를 돌려줘 두 번 지급되지 않는다. */
export class MoleService implements MolePort {
  constructor(private readonly request: RequestJSON, private readonly context: {
    owner: () => string
    storage: () => PendingStorage
    newKey: () => string
  }) {}

  private async call<T>(parse: (value: unknown) => T, path: string, init?: RequestInit) {
    try { return parse(await this.request(BASE + path, init)) } catch (error) {
      if (error instanceof MoleError) throw error
      throw failure(error)
    }
  }

  status() { return this.call(parseMoleState, '/status') }

  async start() {
    const owner = this.context.owner()
    if (!owner) throw new MoleError('공원 연결을 확인해 주세요.', false)
    const storageKey = `ontop:whack-a-mole:pending-start:${owner}`
    let storage: PendingStorage, key: string
    try {
      storage = this.context.storage()
      const saved = storage.getItem(storageKey)
      key = saved && KEY.test(saved) ? saved : this.context.newKey()
      if (!KEY.test(key)) throw new Error('invalid key')
      storage.setItem(storageKey, key)
    } catch {
      throw new MoleError('브라우저 저장 공간을 확인해 주세요.', false)
    }
    try {
      const round = await this.call(parseMoleRound, '/rounds', { method: 'POST', headers: { 'Idempotency-Key': key } })
      storage.removeItem(storageKey)
      return round
    } catch (error) {
      if (error instanceof MoleError && !error.retryable) storage.removeItem(storageKey)
      throw error
    }
  }

  complete(roundId: string, hits: readonly Hit[]) {
    return this.call(parseMoleSettlement, `/rounds/${encodeURIComponent(roundId)}/complete`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hits: hits.map(({ hole, at }) => ({ hole, at })) }),
    })
  }
}
