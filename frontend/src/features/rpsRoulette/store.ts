import { create } from 'zustand'
import { parkRuntime } from '../../park/runtime/runtime'
import { useSession } from '../../network/worldClient'
import { clearRoamingInput, inputState } from '../../world/inputOwnership'
import { refreshWalletAfterSettlement } from '../wallet/settlementRefresh'
import { PreviewRpsRouletteService } from './preview'
import { RpsRouletteError, RpsRouletteService } from './service'
import type { Hand } from './ledHands'
import type { RpsState } from './protocol'

export interface RpsRoulettePort {
  status(): Promise<RpsState>
  start(fee: number): Promise<RpsState>
  hand(roundId: string, seq: number, hand: Hand): Promise<RpsState>
  challenge(roundId: string, seq: number): Promise<RpsState>
  stop(roundId: string, seq: number): Promise<RpsState>
}
type Busy = 'status' | 'start' | 'hand' | 'challenge' | 'stop' | null

// DEV에서 명시적으로 켠 경우만 화면 확인용 대역을 쓴다. 서버 실패 시 대역으로 바꾸지 않는다.
export const RPS_ROULETTE_PREVIEW = import.meta.env.DEV && import.meta.env.VITE_RPS_ROULETTE_PREVIEW === 'true'
let port: RpsRoulettePort = RPS_ROULETTE_PREVIEW ? new PreviewRpsRouletteService() : new RpsRouletteService(parkRuntime.requestJSON, {
  owner: () => useSession.getState().sessionId,
  storage: () => sessionStorage,
  newKey: () => crypto.randomUUID().replaceAll('-', ''),
})
/** 단위 검사에서만 사용한다. */
export function setRpsRoulettePort(next: RpsRoulettePort) { port = next }

export interface RpsRouletteStore {
  open: boolean
  fee: number
  busy: Busy
  pressed: Hand | null
  error: string
  data: RpsState | null
  /** 응답을 받은 순간의 서버 시각과 단조 시계. 타이머는 이 기준으로만 계산한다. */
  anchor: { serverMs: number; at: number } | null
}

export const useRpsRoulette = create<RpsRouletteStore>(() => ({
  open: false, fee: 10, busy: null, pressed: null, error: '', data: null, anchor: null,
}))

export function serverNowMs(state = useRpsRoulette.getState(), now = performance.now()) {
  return state.anchor ? state.anchor.serverMs + (now - state.anchor.at) : Date.now()
}

function apply(data: RpsState) {
  const owner = useSession.getState().sessionId
  const round = data.round
  useRpsRoulette.setState({ data, anchor: { serverMs: Date.parse(data.serverNow), at: performance.now() }, error: '' })
  if (round && owner) {
    refreshWalletAfterSettlement(owner, `rps-roulette:fee:${round.id}`)
    if (round.outcome === 'PAID') refreshWalletAfterSettlement(owner, `rps-roulette:payout:${round.id}`)
  }
}

async function run(busy: Exclude<Busy, null>, task: () => Promise<RpsState>) {
  if (useRpsRoulette.getState().busy) return
  useRpsRoulette.setState({ busy, error: '' })
  try {
    apply(await task())
  } catch (error) {
    const failure = error instanceof RpsRouletteError ? error : new RpsRouletteError('판 상태를 확인하지 못했어요.', true)
    useRpsRoulette.setState({ error: failure.message })
    // 반영 여부가 불확실하거나 화면이 판보다 뒤처졌으면 서버 상태를 다시 읽는다.
    if (busy !== 'status' && (failure.retryable || ['RPS_ROUND_IN_PROGRESS', 'RPS_INVALID_PHASE'].includes(failure.code))) {
      useRpsRoulette.setState({ busy: null, pressed: null })
      await refreshRpsRoulette()
      useRpsRoulette.setState({ error: failure.message })
      return
    }
  } finally {
    if (useRpsRoulette.getState().busy === busy) useRpsRoulette.setState({ busy: null, pressed: null })
  }
}

export function openRpsRoulette() {
  if (useRpsRoulette.getState().open) return
  clearRoamingInput()
  inputState.minigameOpen = true
  if (document.pointerLockElement) document.exitPointerLock()
  useRpsRoulette.setState({ open: true, error: '' })
  void refreshRpsRoulette()
}

/** 창 닫기는 판 포기가 아니다. 공개된 손은 서버가 마감에 맞춰 끝까지 처리한다. */
export function closeRpsRoulette() {
  inputState.minigameOpen = false
  useRpsRoulette.setState({ open: false, pressed: null })
}

export const refreshRpsRoulette = () => run('status', () => port.status())
export const selectRpsFee = (fee: number) => { if (!useRpsRoulette.getState().busy) useRpsRoulette.setState({ fee }) }
export const startRpsRound = () => run('start', () => port.start(useRpsRoulette.getState().fee))

export function playRpsHand(hand: Hand) {
  const round = useRpsRoulette.getState().data?.round
  if (round?.phase !== 'DUEL' || useRpsRoulette.getState().busy) return
  useRpsRoulette.setState({ pressed: hand })
  void run('hand', () => port.hand(round.id, round.seq, hand))
}

export function challengeRpsRound() {
  const round = useRpsRoulette.getState().data?.round
  if (round?.phase === 'DECIDE' && round.stakeLevel < 2) void run('challenge', () => port.challenge(round.id, round.seq))
}

export function stopRpsRound() {
  const round = useRpsRoulette.getState().data?.round
  if (round?.phase === 'DECIDE') void run('stop', () => port.stop(round.id, round.seq))
}
