import { createStore } from 'zustand/vanilla'
import { VR_GAMES, VR_PLAY_FEE, type VrGameId, type VrPlayMode } from './catalog'
import type { VrAdmission, VrAdmissionPort } from './admission'
import { VrAdmissionError } from './admission'

interface VrZoneState {
  phase: 'closed' | 'catalog' | 'mode' | 'game'
  playMode: VrPlayMode
  selected: VrGameId
  balance: number | null
  loading: boolean
  purchasing: boolean
  error: string
  receipt: VrAdmission | null
}

export class VrZoneController {
  readonly store = createStore<VrZoneState>(() => ({ phase: 'closed', selected: 'skewer', playMode: 'pc', balance: null, loading: false, purchasing: false, error: '', receipt: null }))
  private visit = 0
  private key: string | null = null
  private inFlight: Promise<boolean> | null = null
  constructor(readonly admission: VrAdmissionPort) {}

  async open() {
    if (this.store.getState().phase !== 'closed') return
    const visit = ++this.visit
    this.store.setState({ phase: 'catalog', loading: true, error: '', balance: null })
    try {
      const balance = await this.admission.balance()
      if (!Number.isSafeInteger(balance) || balance < 0) throw new Error('잔액을 확인하지 못했어요. 다시 열어주세요.')
      if (visit === this.visit) this.store.setState({ balance })
    } catch (error) { if (visit === this.visit) this.store.setState({ error: error instanceof Error ? error.message : '잔액 조회에 실패했어요.' }) }
    finally { if (visit === this.visit) this.store.setState({ loading: false }) }
  }
  select(game: VrGameId) {
    if (this.store.getState().phase === 'catalog' && VR_GAMES.some(item => item.id === game && item.available)) this.store.setState({ selected: game, phase: 'mode' })
  }
  prepare(playMode: VrPlayMode) {
    const state = this.store.getState()
    if (state.phase !== 'mode' || state.loading || state.balance === null || state.balance < VR_PLAY_FEE || this.admission.mode === 'unavailable') return
    this.store.setState({ phase: 'game', playMode, error: '', receipt: null })
  }
  changeMode() {
    const state = this.store.getState()
    if (state.phase !== 'game' || state.receipt || state.purchasing || this.key) return false
    this.store.setState({ phase: 'mode', error: '' })
    return true
  }
  authorize = (): Promise<boolean> => {
    if (this.inFlight) return this.inFlight
    if (this.store.getState().phase !== 'game') return Promise.resolve(false)
    const balance = this.store.getState().balance
    if (balance !== null && balance < VR_PLAY_FEE) {
      this.store.setState({ error: '엽전이 부족해요. 다음 판에는 10냥이 필요합니다.' })
      return Promise.resolve(false)
    }
    this.store.setState({ purchasing: true, error: '' })
    const key = this.key ??= crypto.randomUUID()
    const game = this.store.getState().selected
    const visit = this.visit
    this.inFlight = Promise.resolve().then(() => this.admission.start(game, key)).then(receipt => {
      if (visit !== this.visit) return false
      if (!receipt.id || receipt.game !== game || receipt.fee !== VR_PLAY_FEE || !Number.isSafeInteger(receipt.availableBalance) || receipt.availableBalance < 0) throw new Error('이용권 응답을 확인하지 못했어요. 같은 요청으로 다시 확인해 주세요.')
      this.store.setState({ receipt, balance: receipt.availableBalance })
      this.key = null
      return true
    }).catch(error => {
      if (visit !== this.visit) return false
      if (error instanceof VrAdmissionError && !error.uncertain) this.key = null
      this.store.setState({ error: error instanceof Error ? error.message : '이용권을 확인하지 못했어요. 다시 시도해 주세요.' })
      return false
    }).finally(() => { if (visit === this.visit) { this.inFlight = null; this.store.setState({ purchasing: false }) } })
    return this.inFlight
  }
  back() {
    if (this.store.getState().purchasing) return false
    // An uncertain debit must be retried with the original key, not discarded.
    if (this.key) return false
    this.store.setState({ phase: 'catalog', receipt: null, error: '' })
    return true
  }
  close() {
    if (this.store.getState().purchasing || this.key) return false
    ++this.visit
    this.store.setState({ phase: 'closed', receipt: null, loading: false, error: '' })
    return true
  }
  endVisit() {
    // A changed login/channel cannot accept a late purchase from the previous owner.
    ++this.visit
    this.key = null
    this.inFlight = null
    this.store.setState({ phase: 'closed', receipt: null, balance: null, loading: false, purchasing: false, error: '' })
  }
}
