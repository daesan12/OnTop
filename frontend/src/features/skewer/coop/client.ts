import { createStore } from 'zustand/vanilla'
import { parseCoop, parseCoopResult, parseCoopRanking, type CoopSnapshot, type CoopTransport, type CoopResult, type CoopRanking } from './contracts'
import { refreshWalletAfterSettlement } from '../../wallet/settlementRefresh'
import type { Envelope } from '../../../network/protocol'

export class CoopClient {
  readonly store = createStore<{ snapshot: CoopSnapshot | null; rooms: { gameId: string; players: number; mine: boolean }[]; error: string; pending: boolean; connected: boolean; result: CoopResult | null; resultError: string; resultPending: boolean; ranking: CoopRanking | null; rankingError: string; rankingPending: boolean }>(() => ({ snapshot: null, rooms: [], error: '', pending: false, connected: true, result: null, resultError: '', resultPending: false, ranking: null, rankingError: '', rankingPending: false }))
  private cleanup?: () => void
  private poll?: ReturnType<typeof setTimeout>
  private chain: Promise<void> = Promise.resolve()
  private requestIds = new Set<string>()
  private stopped = false
  private owner: string
  private requestKey = crypto.randomUUID()
  private recoveredGame = ''
  private resultAt = 0
  private watching = new Set<string>()
  inputBlocked = false
  constructor(readonly transport: CoopTransport) { this.owner = transport.scope().userId }
  get snapshot() { return this.store.getState().snapshot }
  get playable() { const p = this.snapshot?.publicState; return !!p && p.phase === 'PLAYING' && !this.inputBlocked && !p.paused && !p.greeting.active && this.store.getState().connected }
  start() {
    this.stopped = false
    this.cleanup = this.transport.subscribe(message => this.accept(message))
    const refresh = async () => {
      if (this.stopped || this.owner !== this.transport.scope().userId) return
      await this.refresh()
      if (!this.stopped) this.poll = setTimeout(() => void refresh(), 1000)
    }
    void refresh()
  }
  stop() { this.stopped = true; clearTimeout(this.poll); this.cleanup?.() }
  private accept(message: Envelope) {
    if (message.type === 'ERROR' && message.requestId && this.requestIds.has(message.requestId)) return true
    if (message.type === 'GAME_CONNECTION_STATE' && this.snapshot && !message.payload.gameId) return true
    if (!String(message.payload.gameId ?? '').startsWith('skewer-coop-')) return false
    if (message.type === 'GAME_STATE') this.install(parseCoop(message.payload))
    if (message.type === 'GAME_CONNECTION_STATE' && message.payload.state) {
      const state = message.payload.state as Record<string, unknown>
      this.install(parseCoop({ ...state, gameId: message.payload.gameId, version: message.payload.version, registered: true }))
    }
    return ['GAME_STATE', 'GAME_CONNECTION_STATE'].includes(message.type)
  }
  private install(snapshot: CoopSnapshot | null) {
    if (!snapshot || this.stopped || this.owner !== this.transport.scope().userId) return
    const current = this.snapshot
    if (current?.gameId === snapshot.gameId && snapshot.version < current.version) return
    if (!snapshot.publicState.players.some(player => player.userId === this.owner)) return
    if (current?.gameId !== snapshot.gameId) { this.resultAt = 0; this.store.setState({ result: null, resultError: '', ranking: null, rankingError: '' }) }
    this.store.setState({ snapshot })
  }
  private async request(type: string, payload: Record<string, unknown>, expected: readonly string[]) {
    let id = ''
    try { return await this.transport.request(type, payload, expected, value => { id = value; this.requestIds.add(id) }) }
    finally { this.requestIds.delete(id) }
  }
  private async recover() {
    if (!this.snapshot?.registered) return
    await this.request('GAME_RECONNECT_CHECK', {}, ['GAME_CONNECTION_STATE'])
    if (this.snapshot?.publicState.phase !== 'FINISHED') await this.sync()
    this.recoveredGame = this.snapshot?.gameId ?? ''
  }
  private async sync() {
    if (!this.snapshot) return
    const response = await this.request('GAME_STATE_CHECK', { gameId: this.snapshot.gameId }, ['GAME_STATE'])
    this.install(parseCoop(response.payload))
  }
  async refresh() {
    const scope = this.transport.scope()
    this.store.setState({ connected: scope.connected })
    if (!scope.connected || !scope.channelId || scope.userId !== this.owner) { this.recoveredGame = ''; return }
    if (this.snapshot?.publicState.phase === 'FINISHED') {
      if (this.store.getState().result?.status !== 'SETTLED' && Date.now() - this.resultAt > 3000) await this.refreshResult()
      return
    }
    try {
      const value = await this.transport.requestJSON(`/api/v1/minigames/skewer/coop/rooms?channelId=${encodeURIComponent(scope.channelId)}`) as { mine?: unknown; rooms?: unknown }
      if (this.stopped) return
      if (Array.isArray(value.rooms)) this.store.setState({ rooms: value.rooms })
      const mine = parseCoop(value.mine)
      if (mine) {
        const first = this.snapshot?.registered !== true && mine.registered
        this.install(mine)
        if (first || mine.registered && this.recoveredGame !== mine.gameId) await this.recover()
      }
      this.store.setState({ connected: true })
    } catch (error) { if (!this.stopped) this.store.setState({ error: '가게에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.' }) }
  }
  async refreshResult() {
    const gameId = this.snapshot?.gameId
    if (!gameId || this.snapshot?.publicState.phase !== 'FINISHED' || this.store.getState().resultPending) return
    this.resultAt = Date.now()
    this.store.setState({ resultPending: true, resultError: '' })
    try {
      const value = await this.transport.requestJSON(`/api/v1/minigames/skewer/coop/result?gameId=${encodeURIComponent(gameId)}`)
      if (this.stopped || this.owner !== this.transport.scope().userId || this.snapshot?.gameId !== gameId) return
      const result = parseCoopResult(value, gameId)
      this.store.setState({ result })
      if (result.status === 'SETTLED') refreshWalletAfterSettlement(this.owner, `skewer-coop:${gameId}`)
    } catch (error) { if (!this.stopped) this.store.setState({ resultError: '보상을 불러오지 못했어요. 다시 확인해 주세요.' }) }
    finally { if (!this.stopped) this.store.setState({ resultPending: false }) }
  }
  async refreshRanking() {
    if (this.store.getState().rankingPending) return
    this.store.setState({ rankingPending: true, rankingError: '' })
    try {
      const value = await this.transport.requestJSON('/api/v1/minigames/skewer/coop/rankings')
      if (!this.stopped && this.owner === this.transport.scope().userId) this.store.setState({ ranking: parseCoopRanking(value) })
    } catch (error) { if (!this.stopped) this.store.setState({ rankingError: '팀 랭킹을 불러오지 못했어요. 다시 시도해 주세요.' }) }
    finally { if (!this.stopped) this.store.setState({ rankingPending: false }) }
  }
  async enter(gameId?: string) {
    if (this.store.getState().pending) return
    this.store.setState({ pending: true, error: '' })
    try {
      const channelId = this.transport.scope().channelId
      const result = await this.transport.requestJSON('/api/v1/minigames/skewer/coop/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(gameId ? { channelId, gameId } : { channelId, requestKey: this.requestKey }) })
      this.install(parseCoop(result))
      await this.recover()
    } catch (error) { this.store.setState({ error: '가게에 입장하지 못했어요. 다시 시도해 주세요.' }) }
    finally { this.store.setState({ pending: false }) }
  }
  act(input: Record<string, unknown>, quiet = false) {
    const gameId = this.snapshot?.gameId
    const work = async () => {
      if (this.stopped || !gameId || gameId !== this.snapshot?.gameId || !this.transport.scope().connected) return
      if ((this.inputBlocked || this.snapshot.publicState.paused) && !['PAUSE', 'CHEF_MODE'].includes(String(input.type))) return
      if (input.type === 'GREET' && (!this.snapshot.publicState.greeting.active || this.snapshot.publicState.greeting.answered)) return
      const actionId = crypto.randomUUID()
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          await this.request('GAME_ACTION_SEND', { gameId, actionId, expectedVersion: this.snapshot!.publicState.actionVersion, input }, ['GAME_ACTION_RESULT'])
          await this.sync()
          if (!quiet) this.store.setState({ error: '' })
          return
        } catch (error) {
          const code = (error as { code?: string }).code
          if (code === 'GAME_ACTION_STALE_VERSION') { await this.sync(); continue }
          if (code === 'GAME_RECOVERY_REQUIRED') { await this.recover(); continue }
          if (!quiet) this.store.setState({ error: code === 'GAME_ACTION_INVALID_ACTION' ? '지금은 할 수 없는 행동이에요. 주문·거리·운반 상태를 확인해주세요.' : '요청을 완료하지 못했어요. 다시 시도해 주세요.' })
          return
        }
      }
      if (!quiet) this.store.setState({ error: '상태가 바뀌었어요. 다시 눌러주세요.' })
    }
    this.chain = this.chain.then(work).catch(() => { this.store.setState({ error: '연결이 원활하지 않아요. 잠시 후 다시 시도해 주세요.' }) })
    return this.chain
  }
  async leave() {
    const snapshot = this.snapshot
    if (!snapshot) return
    if (snapshot.registered && snapshot.publicState.phase !== 'FINISHED') await this.request('GAME_FORFEIT', { gameId: snapshot.gameId, actionId: crypto.randomUUID() }, ['GAME_FORFEIT_RESULT'])
    await this.transport.requestJSON('/api/v1/minigames/skewer/coop/leave', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gameId: snapshot.gameId }) })
    if (snapshot.registered && this.store.getState().result?.status !== 'SETTLED' && this.store.getState().result?.status !== 'UNAVAILABLE') this.watchLeftResult(snapshot.gameId)
    this.requestKey = crypto.randomUUID()
  }
  private watchLeftResult(gameId: string) {
    if (this.watching.has(gameId)) return
    this.watching.add(gameId)
    // 결과를 일찍 닫아도 자신의 확정 영수증만 읽어 기존 지갑 GET을 갱신한다. 금액을 로컬에서 더하지 않는다.
    const check = async (attempt: number): Promise<void> => {
      if (attempt >= 15 || this.owner !== this.transport.scope().userId) { this.watching.delete(gameId); return }
      await new Promise(resolve => setTimeout(resolve, 2000))
      if (this.owner !== this.transport.scope().userId) { this.watching.delete(gameId); return }
      try {
        const value = await this.transport.requestJSON(`/api/v1/minigames/skewer/coop/result?gameId=${encodeURIComponent(gameId)}`)
        const result = parseCoopResult(value, gameId)
        if (this.owner !== this.transport.scope().userId) { this.watching.delete(gameId); return }
        if (result.status === 'SETTLED') { refreshWalletAfterSettlement(this.owner, `skewer-coop:${gameId}`); this.watching.delete(gameId); return }
        if (result.status === 'UNAVAILABLE') { this.watching.delete(gameId); return }
      } catch { /* 정산을 재요청하지 않고 같은 개인 영수증의 조회만 다시 시도한다. */ }
      return check(attempt + 1)
    }
    void check(0)
  }
}
