import { create } from 'zustand'
import { parkRuntime } from '../../park/runtime/runtime'
import { useSession } from '../../network/worldClient'
import { clearRoamingInput, inputState } from '../../world/inputOwnership'
import { refreshWalletAfterSettlement } from '../wallet/settlementRefresh'
import { PreviewMoleService } from './preview'
import { MoleError, MoleService, type MolePort } from './service'
import type { Hit, MoleRound, MoleSettlement, MoleState } from './protocol'

// DEV에서 명시적으로 켠 경우만 화면 확인용 대역을 쓴다. 서버 실패 시 대역으로 바꾸지 않는다.
export const MOLE_PREVIEW = import.meta.env.DEV && import.meta.env.VITE_MOLE_PREVIEW === 'true'
let port: MolePort = MOLE_PREVIEW ? new PreviewMoleService() : new MoleService(parkRuntime.requestJSON, {
  owner: () => useSession.getState().sessionId,
  storage: () => sessionStorage,
  newKey: () => crypto.randomUUID().replaceAll('-', ''),
})
/** 단위 검사와 화면 확인에서만 사용한다. */
export function setMolePort(next: MolePort) { port = next }

/** idle → starting → countdown → playing → submitting → result. 카운트다운과 90초 진행은 화면이 시계를 잰다. */
export type MolePhase = 'idle' | 'starting' | 'countdown' | 'playing' | 'submitting' | 'result'
export interface MoleStore {
  open: boolean
  phase: MolePhase
  state: MoleState | null
  round: MoleRound | null
  settlement: MoleSettlement | null
  error: string
  /** 마지막 피버 구간을 진행 중이다. 배경음악만 이 값을 본다. */
  fever: boolean
}

export const useMole = create<MoleStore>(() => ({ open: false, phase: 'idle', state: null, round: null, settlement: null, error: '', fever: false }))

const message = (error: unknown) => error instanceof MoleError ? error.message : '게임기 상태를 확인하지 못했어요.'

export function openMole() {
  if (useMole.getState().open) return
  clearRoamingInput()
  inputState.minigameOpen = true
  if (document.pointerLockElement) document.exitPointerLock()
  useMole.setState({ open: true, phase: 'idle', round: null, settlement: null, error: '' })
  void refreshMole()
}

/** 진행 중에 닫으면 그 판은 보상 없이 끝난다. 서버는 다음 시작 때 이전 판을 닫는다. */
export function closeMole() {
  inputState.minigameOpen = false
  useMole.setState({ open: false, phase: 'idle', round: null, fever: false })
}

export async function refreshMole() {
  try { useMole.setState({ state: await port.status() }) } catch (error) { useMole.setState({ error: message(error) }) }
}

export async function startMole() {
  const { phase } = useMole.getState()
  if (phase !== 'idle' && phase !== 'result') return
  useMole.setState({ phase: 'starting', error: '', settlement: null })
  try {
    const round = await port.start()
    if (useMole.getState().phase === 'starting') useMole.setState({ phase: 'countdown', round })
  } catch (error) {
    if (useMole.getState().phase === 'starting') useMole.setState({ phase: 'idle', error: message(error) })
  }
}

export function beginMolePlay() {
  if (useMole.getState().phase === 'countdown') useMole.setState({ phase: 'playing' })
}

/** 90초가 끝나면 타격 기록을 보낸다. 응답을 잃으면 같은 기록으로 다시 보내도 서버가 같은 결과를 돌려준다. */
export async function finishMole(hits: readonly Hit[], retryDelayMs = 1500) {
  const { round, phase } = useMole.getState()
  if (!round || phase !== 'playing') return
  useMole.setState({ phase: 'submitting', error: '' })
  for (let attempt = 0; ; attempt++) {
    try {
      const settlement = await port.complete(round.id, hits)
      if (useMole.getState().round?.id !== round.id) return
      const previous = useMole.getState().state
      useMole.setState({ phase: 'result', settlement, state: previous && { ...previous, todayEarned: settlement.todayEarned,
        dailyCap: settlement.dailyCap, bestScore: settlement.bestScore, last: settlement.result } })
      const owner = useSession.getState().sessionId
      if (owner && settlement.result.reward > 0) refreshWalletAfterSettlement(owner, `mole:reward:${settlement.result.id}`)
      return
    } catch (error) {
      if (useMole.getState().round?.id !== round.id) return
      const retry = error instanceof MoleError ? error.retryable : true
      if (!retry || attempt >= 3) {
        useMole.setState({ phase: 'result', settlement: null, error: message(error) })
        return
      }
      await new Promise(resolve => setTimeout(resolve, retryDelayMs))
    }
  }
}
