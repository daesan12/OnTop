import { create } from 'zustand'
import { parkRuntime } from '../../park/runtime/runtime'
import { useSession } from '../../network/worldClient'
import { refreshWalletAfterSettlement } from '../wallet/settlementRefresh'
import { PreviewRaffleService } from './preview'
import { RaffleError, RaffleService } from './service'
import type { RaffleCurrent, RafflePurchase } from './protocol'

export interface RafflePort {
  current(): Promise<RaffleCurrent>
  purchase(): Promise<RafflePurchase>
}

// DEV에서 명시적으로 켠 경우만 화면 확인용 대역을 쓴다. 서버 실패 시 대역으로 바꾸지 않는다.
export const RAFFLE_PREVIEW = import.meta.env.DEV && import.meta.env.VITE_RAFFLE_PREVIEW === 'true'
let port: RafflePort = RAFFLE_PREVIEW ? new PreviewRaffleService() : new RaffleService(parkRuntime.requestJSON, {
  owner: () => useSession.getState().sessionId,
  storage: () => sessionStorage,
  newKey: () => crypto.randomUUID().replaceAll('-', ''),
})
/** 단위 검사에서만 사용한다. */
export function setRafflePort(next: RafflePort) { port = next }

export interface RaffleStore {
  busy: 'status' | 'purchase' | null
  error: string
  /** 결과를 받지 못한 구매가 있어 같은 키로 다시 확인해야 한다. */
  retry: boolean
  data: RaffleCurrent | null
}
export const useRaffle = create<RaffleStore>(() => ({ busy: null, error: '', retry: false, data: null }))

const failure = (error: unknown) => error instanceof RaffleError ? error : new RaffleError('응모 정보를 확인하지 못했어요.', true)

async function load() {
  try { useRaffle.setState({ data: await port.current() }); return '' } catch (error) { return failure(error).message }
}

export async function refreshRaffle() {
  if (useRaffle.getState().busy) return
  useRaffle.setState({ busy: 'status', error: '' })
  const error = await load()
  useRaffle.setState({ busy: null, error })
}

/** 번호는 서버가 배정한다. 성공·실패 모두 이어서 이번 주 상태를 다시 읽어 화면을 맞춘다. */
export async function drawRaffleTicket(): Promise<RafflePurchase | null> {
  if (useRaffle.getState().busy) return null
  useRaffle.setState({ busy: 'purchase', error: '' })
  try {
    const receipt = await port.purchase()
    const owner = useSession.getState().sessionId
    if (owner) refreshWalletAfterSettlement(owner, `raffle:${receipt.ticketId}`)
    useRaffle.setState(s => ({ retry: false, data: s.data && withTicket(s.data, receipt) }))
    await load()
    return receipt
  } catch (error) {
    const reason = failure(error)
    useRaffle.setState({ retry: reason.retryable })
    await load()
    useRaffle.setState({ error: reason.message })
    return null
  } finally {
    useRaffle.setState({ busy: null })
  }
}

function withTicket(data: RaffleCurrent, r: RafflePurchase): RaffleCurrent {
  if (data.roundId !== r.roundId || data.tickets.some(t => t.ticketId === r.ticketId)) return data
  return { ...data, purchasedCount: r.purchasedCount, remainingCount: r.remainingCount,
    tickets: [...data.tickets, { ticketId: r.ticketId, ticketNumber: r.ticketNumber, purchasedAt: r.purchasedAt }] }
}
