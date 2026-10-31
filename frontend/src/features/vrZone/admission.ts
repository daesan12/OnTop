import { VR_PLAY_FEE, type VrGameId } from './catalog'

export interface VrAdmission { id: string; game: VrGameId; fee: number; availableBalance: number }
export interface VrAdmissionPort {
  readonly mode: 'local-preview' | 'unavailable' | 'server'
  balance(): Promise<number>
  hasPendingRequest?(): boolean
  start(game: VrGameId, idempotencyKey: string): Promise<VrAdmission>
}

export class VrAdmissionError extends Error {
  constructor(message: string, readonly uncertain: boolean) { super(message) }
}

/** Explicit test money only. Never reads/writes the account wallet or storage. */
export class LocalVrAdmission implements VrAdmissionPort {
  readonly mode = 'local-preview' as const
  private available: number
  private readonly receipts = new Map<string, VrAdmission>()
  constructor(initialBalance = 100) {
    if (!Number.isSafeInteger(initialBalance) || initialBalance < 0) throw new Error('테스트 잔액을 확인하세요.')
    this.available = initialBalance
  }
  async balance() { return this.available }
  async start(game: VrGameId, key: string): Promise<VrAdmission> {
    if (game !== 'skewer' || !/^[a-zA-Z0-9_-]{1,80}$/.test(key)) throw new Error('이용 요청을 확인하지 못했어요.')
    const previous = this.receipts.get(key)
    if (previous) return { ...previous }
    if (this.available < VR_PLAY_FEE) throw new Error('엽전이 부족해요. 한 판에 10냥이 필요합니다.')
    this.available -= VR_PLAY_FEE
    const receipt = { id: `local-vr-${this.receipts.size + 1}`, game, fee: VR_PLAY_FEE, availableBalance: this.available }
    this.receipts.set(key, receipt)
    return { ...receipt }
  }
}

/** Fail closed until a server-authoritative, idempotent entry-fee endpoint is
 * agreed. The existing Bungeoppang start API must not be reused as a VR debit. */
export class UnavailableVrAdmission implements VrAdmissionPort {
  readonly mode = 'unavailable' as const
  constructor(private readonly readBalance: () => Promise<number>) {}
  balance() { return this.readBalance() }
  async start(): Promise<VrAdmission> { throw new Error('VR 이용권 서버 연결을 준비하고 있어요. 엽전은 차감되지 않았습니다.') }
}
