import { createStore } from 'zustand/vanilla'
import { parseCoop, parseCoopResult, parseCoopRanking, type CoopSnapshot, type CoopTransport, type CoopResult, type CoopRanking, type CoopRoom } from './contracts'
import { refreshWalletAfterSettlement } from '../../wallet/settlementRefresh'
import type { Envelope } from '../../../network/protocol'

export class CoopClient {
  readonly store = createStore<{ snapshot: CoopSnapshot | null; rooms: CoopRoom[]; lobbyPage: 'home' | 'rooms'; error: string; pending: boolean; connected: boolean; result: CoopResult | null; resultError: string; resultPending: boolean; ranking: CoopRanking | null; rankingError: string; rankingPending: boolean }>(() => ({ snapshot: null, rooms: [], lobbyPage: 'home', error: '', pending: false, connected: true, result: null, resultError: '', resultPending: false, ranking: null, rankingError: '', rankingPending: false }))
  private cleanup?: () => void
  private poll?: ReturnType<typeof setTimeout>
  private resultPoll?: ReturnType<typeof setTimeout>
  private chain: Promise<void> = Promise.resolve()
  private movementSequence = 0
  private requestIds = new Set<string>()
  private stopped = false
  private owner: string
  private requestKey = crypto.randomUUID()
  private recoveredGame = ''
  private resultAt = 0
  private watching = new Set<string>()
  private dismissedGames = new Set<string>()
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
  stop() { this.stopped = true; clearTimeout(this.poll); clearTimeout(this.resultPoll); this.cleanup?.() }
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
  private install(snapshot: CoopSnapshot | null, entering = false) {
    if (!snapshot || this.stopped || this.owner !== this.transport.scope().userId || this.dismissedGames.has(snapshot.gameId)) return
    const current = this.snapshot
    if (current && current.gameId !== snapshot.gameId && !entering) return
    if (current?.gameId === snapshot.gameId && snapshot.version < current.version) return
    const own = snapshot.publicState.players.find(player => player.userId === this.owner)
    // Public membership binds the private payload to this player, not their colleague.
    if (!own || own.role !== snapshot.privateState.role) return
    if (current?.gameId === snapshot.gameId && current.publicState.phase !== 'WAITING' && current.privateState.role) {
      if (snapshot.privateState.role !== current.privateState.role) return
      if ((snapshot.publicState.round ?? 0) < (current.publicState.round ?? 0)) return
      if (snapshot.publicState.phase === 'WAITING') return
      if (current.publicState.phase === 'FINISHED' && snapshot.publicState.phase !== 'FINISHED') return
      if ((snapshot.publicState.round ?? 0) === (current.publicState.round ?? 0)
        && current.publicState.phase === 'PLAYING' && snapshot.publicState.phase === 'COUNTDOWN') return
    }
    if (snapshot.publicState.endReason === 'SKEWER_CANCELLED') {
      this.dismissRoom(snapshot.gameId, '준비 중인 방이 닫혔어요. 다른 가게를 선택해 주세요.')
      return
    }
    if (current?.gameId !== snapshot.gameId) { clearTimeout(this.resultPoll); this.resultAt = 0; this.store.setState({ result: null, resultPending: false, resultError: '', ranking: null, rankingError: '' }) }
    this.store.setState({ snapshot })
    if (snapshot.publicState.phase === 'FINISHED' && (current?.gameId !== snapshot.gameId || current.publicState.phase !== 'FINISHED')) void this.refreshResult()
  }
  private dismissRoom(gameId: string, error = '') {
    this.dismissedGames.add(gameId)
    this.requestKey = crypto.randomUUID()
    this.recoveredGame = ''
    this.inputBlocked = false
    clearTimeout(this.resultPoll)
    this.store.setState({ snapshot: null, lobbyPage: 'rooms', error, result: null, resultPending: false, resultError: '', ranking: null })
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
      if (!this.resultPoll && !['SETTLED', 'UNAVAILABLE'].includes(this.store.getState().result?.status ?? '') && Date.now() - this.resultAt > 1000) await this.refreshResult()
      return
    }
    try {
      const requestedGame = this.snapshot?.gameId
      const value = await this.transport.requestJSON(`/api/v1/minigames/skewer/coop/rooms?channelId=${encodeURIComponent(scope.channelId)}`) as { mine?: unknown; rooms?: unknown }
      if (this.stopped) return
      if (Array.isArray(value.rooms)) this.store.setState({ rooms: value.rooms.filter((room): room is CoopRoom =>
        !!room && typeof room.gameId === 'string' && typeof room.roomName === 'string'
        && typeof room.hostNickname === 'string' && typeof room.locked === 'boolean'
        && typeof room.mine === 'boolean' && Number.isInteger(room.players) && room.players >= 1 && room.players <= 2) })
      const mine = parseCoop(value.mine)
      if (mine) {
        const first = this.snapshot?.registered !== true && mine.registered
        this.install(mine)
        if (first || mine.registered && this.recoveredGame !== mine.gameId) await this.recover()
      } else if (value.mine === null && requestedGame && this.snapshot?.gameId === requestedGame
        && !this.store.getState().pending) {
        this.dismissRoom(requestedGame, '이전 가게가 닫혔거나 보관 시간이 지났어요. 다른 가게를 선택해 주세요.')
      }
      this.store.setState({ connected: true })
    } catch (error) { if (!this.stopped) this.store.setState({ error: '가게에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.' }) }
  }
  async refreshResult() {
    const gameId = this.snapshot?.gameId
    if (!gameId || this.snapshot?.publicState.phase !== 'FINISHED' || this.store.getState().resultPending
      || this.stopped || this.owner !== this.transport.scope().userId || !this.transport.scope().connected) return
    clearTimeout(this.resultPoll)
    this.resultPoll = undefined
    this.resultAt = Date.now()
    this.store.setState({ resultPending: true, resultError: '' })
    try {
      const value = await this.transport.requestJSON(`/api/v1/minigames/skewer/coop/result?gameId=${encodeURIComponent(gameId)}`)
      if (this.stopped || this.owner !== this.transport.scope().userId || this.snapshot?.gameId !== gameId) return
      const result = parseCoopResult(value, gameId)
      this.store.setState({ result })
      if (result.status === 'SETTLED') refreshWalletAfterSettlement(this.owner, `skewer-coop:${gameId}`)
    } catch (error) {
      if (!this.stopped && this.owner === this.transport.scope().userId && this.snapshot?.gameId === gameId) {
        this.store.setState({ resultError: '보상을 불러오지 못했어요. 다시 확인해 주세요.' })
      }
    }
    finally {
      if (!this.stopped && this.owner === this.transport.scope().userId && this.snapshot?.gameId === gameId) {
        this.store.setState({ resultPending: false })
        if (!['SETTLED', 'UNAVAILABLE'].includes(this.store.getState().result?.status ?? '')) {
          this.resultPoll = setTimeout(() => { this.resultPoll = undefined; void this.refreshResult() }, this.store.getState().resultError ? 3000 : 500)
        }
      }
    }
  }
  private rankingRequest = 0
  async refreshRanking(mode: 'PC' | 'VR' | 'ALL' = 'ALL') {
    const request = ++this.rankingRequest
    this.store.setState({ rankingPending: true, rankingError: '', ranking: null })
    try {
      const value = parseCoopRanking(await this.transport.requestJSON(`/api/v1/minigames/skewer/coop/rankings?mode=${mode}`))
      if (value.playMode !== mode) throw new Error('플레이 방식이 다른 랭킹입니다.')
      if (request === this.rankingRequest && !this.stopped && this.owner === this.transport.scope().userId) this.store.setState({ ranking: value })
    } catch (error) { if (request === this.rankingRequest && !this.stopped) this.store.setState({ rankingError: '팀 랭킹을 불러오지 못했어요. 다시 시도해 주세요.' }) }
    finally { if (request === this.rankingRequest && !this.stopped) this.store.setState({ rankingPending: false }) }
  }
  async enter(gameId?: string, options: { roomName?: string; password?: string } = {}) {
    if (this.store.getState().pending) return false
    this.store.setState({ pending: true, error: '' })
    try {
      const channelId = this.transport.scope().channelId
      const result = await this.transport.requestJSON('/api/v1/minigames/skewer/coop/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(gameId ? { channelId, gameId, password: options.password ?? '' } : { channelId, requestKey: this.requestKey, roomName: options.roomName ?? '함께 여는 꼬치집', password: options.password ?? '' }) })
      this.install(parseCoop(result), true)
      await this.recover()
      return !!this.snapshot
    } catch (error) {
      const failure = error && typeof error === 'object' ? error as { code?: string; status?: number } : {}
      const code = failure.code
      this.store.setState({ error: code === 'SKEWER_COOP_PASSWORD_INVALID' ? '비밀번호가 맞지 않아요.'
        : code === 'SKEWER_COOP_PASSWORD_THROTTLED' ? '비밀번호를 여러 번 확인했어요. 30초 후 다시 시도해 주세요.'
        : code === 'SKEWER_COOP_ROOM_FULL' ? '가게 인원이 가득 찼어요. 다른 가게를 선택해 주세요.'
        : code === 'SKEWER_COOP_ROOM_CLOSED' ? '가게가 닫혔어요. 목록에서 다른 가게를 선택해 주세요.'
        : failure.status === 404 ? '지금은 협동 가게를 열 수 없어요. 잠시 후 다시 시도해 주세요.'
        : code === 'SKEWER_COOP_STORAGE_UNAVAILABLE' ? '가게 정보를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.'
        : gameId ? '가게에 참가하지 못했어요. 목록을 새로고침하고 다시 시도해 주세요.'
        : '가게를 열지 못했어요. 연결을 확인하고 다시 시도해 주세요.' })
      return false
    }
    finally { this.store.setState({ pending: false }) }
  }
  act(input: Record<string, unknown>, quiet = false, options: { preserveMovement?: boolean; refreshGreeting?: boolean } = {}) {
    const gameId = this.snapshot?.gameId
    const round = this.snapshot?.publicState.round ?? 0
    const greetingIndex = this.snapshot?.publicState.greeting.index
    const movement = input.type === 'MOVE'
    const gameplay = ['MOVE', 'INTERACT', 'RETURN_SAKE', 'TAKE_STORED', 'THREAD', 'CHOOSE', 'UNTHREAD', 'SUBMIT', 'RESTART_REQUEST'].includes(String(input.type))
    const sequence = movement ? ++this.movementSequence : 0
    const superseded = () => movement && !options.preserveMovement && sequence !== this.movementSequence
    const work = async () => {
      // 응답 유실 뒤 재시도는 먼저 서버 확인. 늦게 도착한 이전 인사는 다음 이벤트에 보내지 않는다.
      if (input.type === 'GREET' && options.refreshGreeting) {
        if (this.stopped || gameId !== this.snapshot?.gameId || !this.transport.scope().connected
          || round !== (this.snapshot?.publicState.round ?? 0) || greetingIndex !== this.snapshot?.publicState.greeting.index) return
        await this.sync()
      }
      const actionId = crypto.randomUUID()
      for (let attempt = 0; attempt < 4; attempt++) {
        if (this.stopped || !gameId || gameId !== this.snapshot?.gameId || !this.transport.scope().connected
          || round !== (this.snapshot.publicState.round ?? 0) || superseded() || gameplay && !this.playable) return
        // 상태 복구 중 일시정지·인사·영업 종료가 시작되면 지난 게임 입력을 재전송하지 않는다.
        if ((this.inputBlocked || this.snapshot.publicState.paused) && !['PAUSE', 'CHEF_MODE', 'RESTART_REPLY'].includes(String(input.type))) return
        if (input.type === 'GREET' && (this.snapshot.publicState.phase !== 'PLAYING' || greetingIndex !== this.snapshot.publicState.greeting.index
          || !this.snapshot.publicState.greeting.active || this.snapshot.publicState.greeting.answered)) {
          if (!quiet && greetingIndex === this.snapshot.publicState.greeting.index && this.snapshot.publicState.greeting.answered) this.store.setState({ error: '' })
          return
        }
        if (input.type === 'RESTART_REPLY' && input.requestId !== this.snapshot?.publicState.restart?.id) return
        try {
          await this.request('GAME_ACTION_SEND', { gameId, actionId, expectedVersion: this.snapshot!.publicState.actionVersion, input }, ['GAME_ACTION_RESULT'])
          // MOVE는 매 틱의 GAME_STATE로 확인한다. 추가 왕복으로 다음 이동/정지 입력을 지연시키지 않는다.
          if (input.type !== 'MOVE') await this.sync()
          if (!quiet) this.store.setState({ error: '' })
          return
        } catch (error) {
          if (superseded()) return
          const code = (error as { code?: string }).code
          if (code === 'GAME_ACTION_STALE_VERSION') { await this.sync(); continue }
          if (code === 'GAME_RECOVERY_REQUIRED') { await this.recover(); continue }
          if (!quiet) this.store.setState({ error: code === 'GAME_ACTION_INVALID_ACTION'
            ? ['THREAD', 'SUBMIT'].includes(String(input.type)) ? '주문표를 다시 확인해 주세요. 재료와 꽂는 순서가 맞는지 살펴봐 주세요.' : '지금은 할 수 없는 행동이에요. 주문·거리·운반 상태를 확인해주세요.'
            : '요청을 완료하지 못했어요. 다시 시도해 주세요.' })
          return
        }
      }
      if (!quiet) this.store.setState({ error: '상태가 바뀌었어요. 다시 눌러주세요.' })
    }
    // 공통 WS는 세션당 입력 하나만 처리한다. MOVE도 이 순서를 지킨다.
    // 대기 중 바뀐 이동은 위에서 최신 방향만 남기되 E 직전 정지는 보존한다.
    this.chain = this.chain.then(work).catch(() => { this.store.setState({ error: '연결이 원활하지 않아요. 잠시 후 다시 시도해 주세요.' }) })
    return this.chain
  }
  async leave() {
    const snapshot = this.snapshot
    if (!snapshot) return
    const waiting = snapshot.publicState.phase === 'WAITING'
    if (snapshot.registered && !waiting && snapshot.publicState.phase !== 'FINISHED') await this.request('GAME_FORFEIT', { gameId: snapshot.gameId, actionId: crypto.randomUUID() }, ['GAME_FORFEIT_RESULT'])
    await this.transport.requestJSON('/api/v1/minigames/skewer/coop/leave', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gameId: snapshot.gameId }) })
    if (snapshot.registered && !waiting && this.store.getState().result?.status !== 'SETTLED' && this.store.getState().result?.status !== 'UNAVAILABLE') this.watchLeftResult(snapshot.gameId)
    if (waiting) this.dismissRoom(snapshot.gameId)
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
