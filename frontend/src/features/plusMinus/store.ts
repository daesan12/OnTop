import { create } from 'zustand'
import { parkRuntime } from '../../park/runtime/runtime'
import { useSession } from '../../network/worldClient'
import { clearRoamingInput, inputState } from '../../world/inputOwnership'
import { refreshWalletAfterSettlement } from '../wallet/settlementRefresh'
import { PreviewPlusMinusService } from './preview'
import { PlusMinusError, PlusMinusService } from './service'
import type { PlusMinusState } from './protocol'

export interface PlusMinusPort {
  status(): Promise<PlusMinusState>
  start(): Promise<PlusMinusState>
}
type Busy = 'status' | 'start' | null

// DEV에서 명시적으로 켠 경우만 화면 확인용 대역을 쓴다. 서버 실패 시 대역으로 바꾸지 않는다.
export const PLUS_MINUS_PREVIEW = import.meta.env.DEV && import.meta.env.VITE_PLUS_MINUS_PREVIEW === 'true'
let port: PlusMinusPort = PLUS_MINUS_PREVIEW ? new PreviewPlusMinusService() : new PlusMinusService(parkRuntime.requestJSON, {
  owner: () => useSession.getState().sessionId,
  storage: () => sessionStorage,
  newKey: () => crypto.randomUUID().replaceAll('-', ''),
})
/** 단위 검사에서만 사용한다. */
export function setPlusMinusPort(next: PlusMinusPort) { port = next }

export interface PlusMinusStore {
  open: boolean
  busy: Busy
  error: string
  data: PlusMinusState | null
  /** 방금 START한 판. 정지 버튼 연출이 끝날 때까지 결과와 지갑 갱신을 미룬다. */
  revealing: string | null
}

export const usePlusMinus = create<PlusMinusStore>(() => ({ open: false, busy: null, error: '', data: null, revealing: null }))

function settle(roundId: string) {
  const owner = useSession.getState().sessionId
  const round = usePlusMinus.getState().data?.round
  if (!owner || round?.id !== roundId) return
  refreshWalletAfterSettlement(owner, `plus-minus:fee:${round.id}`)
  if (round.payout > 0) refreshWalletAfterSettlement(owner, `plus-minus:payout:${round.id}`)
}

async function run(busy: Exclude<Busy, null>, task: () => Promise<PlusMinusState>) {
  if (usePlusMinus.getState().busy) return
  usePlusMinus.setState({ busy, error: '' })
  try {
    const data = await task()
    const fresh = busy === 'start' && !!data.round && data.round.id !== usePlusMinus.getState().data?.round?.id
    const revealing = fresh ? data.round!.id : usePlusMinus.getState().revealing
    usePlusMinus.setState({ data, error: '', revealing })
    if (data.round && data.round.id !== revealing) settle(data.round.id)
  } catch (error) {
    const failure = error instanceof PlusMinusError ? error : new PlusMinusError('게임기 상태를 확인하지 못했어요.', true)
    usePlusMinus.setState({ error: failure.message })
    // 반영 여부가 불확실하면 서버 상태를 다시 읽는다. 같은 키 재시도는 다음 START가 맡는다.
    if (busy === 'start' && failure.retryable) {
      usePlusMinus.setState({ busy: null })
      await refreshPlusMinus()
      usePlusMinus.setState({ error: failure.message })
      return
    }
  } finally {
    if (usePlusMinus.getState().busy === busy) usePlusMinus.setState({ busy: null })
  }
}

export function openPlusMinus() {
  if (usePlusMinus.getState().open) return
  clearRoamingInput()
  inputState.minigameOpen = true
  if (document.pointerLockElement) document.exitPointerLock()
  usePlusMinus.setState({ open: true, error: '', revealing: null })
  void refreshPlusMinus()
}

/** 판은 START 순간 이미 정산됐다. 연출 중에 닫아도 결과와 지갑은 그대로 반영된다. */
export function closePlusMinus() {
  finishPlusMinusReveal()
  inputState.minigameOpen = false
  usePlusMinus.setState({ open: false })
}

/** 세 릴이 모두 멈춘 뒤 결과를 공개하고 지갑을 다시 읽는다. */
export function finishPlusMinusReveal() {
  const id = usePlusMinus.getState().revealing
  if (!id) return
  usePlusMinus.setState({ revealing: null })
  settle(id)
}

export const refreshPlusMinus = () => run('status', () => port.status())
export function startPlusMinus() {
  if (!usePlusMinus.getState().revealing) void run('start', () => port.start())
}
