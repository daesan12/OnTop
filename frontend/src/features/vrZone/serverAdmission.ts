import { walletBalance } from '../wallet/balance'
import { VR_PLAY_FEE, type VrGameId } from './catalog'
import { VrAdmissionError, type VrAdmission, type VrAdmissionPort } from './admission'

type RequestJSON = (path: string, init?: RequestInit) => Promise<unknown>
type PendingStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export class ServerVrAdmission implements VrAdmissionPort {
  readonly mode = 'server' as const
  constructor(private readonly request: RequestJSON, private readonly context: {
    owner: () => string
    storage: () => PendingStorage
    paid: (owner: string, receipt: string) => void
  }) {}

  async balance() {
    const payload = await this.request('/api/v1/wallets/me')
    walletBalance(payload)
    return (payload as { availableBalance: number }).availableBalance
  }

  hasPendingRequest() {
    try {
      const owner = this.context.owner()
      const key = owner && this.context.storage().getItem(`ontop:skewer:pending-admission:${owner}`)
      return typeof key === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(key)
    } catch { return false }
  }

  async start(game: VrGameId, key: string): Promise<VrAdmission> {
    const owner = this.context.owner()
    if (!owner || game !== 'skewer' || !/^[A-Za-z0-9_-]{1,64}$/.test(key))
      throw new VrAdmissionError('공원 연결과 이용 요청을 확인해 주세요.', false)
    const storageKey = `ontop:skewer:pending-admission:${owner}`
    let storage: PendingStorage
    let requestKey: string
    let recovering = false
    try {
      storage = this.context.storage()
      const saved = storage.getItem(storageKey)
      recovering = saved !== null
      requestKey = saved ?? key
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(requestKey)) throw new Error('Invalid saved request')
      // Save before POST. Losing an acknowledged response must not buy a second ticket after reload.
      storage.setItem(storageKey, requestKey)
    } catch {
      throw new VrAdmissionError('중복 결제를 막기 위한 브라우저 저장 공간을 확인해 주세요. 엽전은 차감되지 않았어요.', false)
    }
    try {
      const payload = await this.request('/api/v1/minigames/skewer/admissions', {
        method: 'POST', headers: { 'Idempotency-Key': requestKey },
      })
      const receipt = payload as Partial<VrAdmission> | null
      if (!receipt || typeof receipt.id !== 'string' || !/^skewer-[1-9]\d*$/.test(receipt.id)
        || receipt.game !== game || receipt.fee !== VR_PLAY_FEE
        || !Number.isSafeInteger(receipt.availableBalance) || receipt.availableBalance! < 0)
        throw new VrAdmissionError('이용권 응답을 확인하지 못했어요. 같은 요청으로 다시 확인해 주세요.', true)
      if (this.context.owner() !== owner)
        throw new VrAdmissionError('공원 연결이 변경됐어요. 다시 입장해 이용권을 확인해 주세요.', true)
      storage.removeItem(storageKey)
      this.context.paid(owner, receipt.id)
      return receipt as VrAdmission
    } catch (error) {
      if (error instanceof VrAdmissionError) throw error
      const status = typeof error === 'object' && error !== null && 'status' in error ? Number(error.status) : 0
      const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : ''
      // An authentication rejection cannot prove an earlier lost response was unpaid.
      if ([409, 429].includes(status) || (status === 400 && !recovering)) {
        storage.removeItem(storageKey)
        throw new VrAdmissionError(code === 'INSUFFICIENT_COINS' ? '엽전이 부족해요. 한 판에 10냥이 필요해요.'
          : status === 429 ? '잠시 후 다시 시작해 주세요.' : '이용 요청이 승인되지 않았어요. 잔액과 연결을 확인해 주세요.', false)
      }
      throw new VrAdmissionError('이용권 응답을 확인하지 못했어요. 같은 요청으로 다시 확인해 주세요.', true)
    }
  }
}
