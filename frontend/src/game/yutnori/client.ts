import { createStore } from 'zustand/vanilla'
import type { CoopTransport } from '../../features/skewer/coop/contracts'
import { parseYut, type YutSnapshot, type YutRoom, type YutRules } from './contracts'

const api = '/api/v1/minigames/yutnori'
export class YutClient {
  readonly store = createStore(() => ({ snapshot: null as YutSnapshot | null, rooms: [] as YutRoom[], pending: false,
    error: '', connected: false, uncertain: false }))
  private stopped = true
  private timer?: ReturnType<typeof setTimeout>
  private key = crypto.randomUUID()
  private owner: string
  private cleanup?: () => void
  private command?: { gameId: string; actionId: string; expectedVersion: number; input: Record<string, unknown> }
  private recovered = ''
  constructor(readonly transport: CoopTransport) { this.owner = transport.scope().userId }
  get snapshot() { return this.store.getState().snapshot }
  start() {
    this.stopped = false
    this.cleanup = this.transport.subscribe(message => {
      if (!String(message.payload.gameId ?? '').startsWith('yut-')) return false
      if (message.type === 'GAME_STATE') this.install({ ...message.payload, registered: true })
      return true
    })
    const poll = async () => {
      await this.refresh()
      if (!this.stopped) this.timer = setTimeout(() => void poll(), 1000)
    }
    void poll()
  }
  stop() { this.stopped = true; clearTimeout(this.timer); this.cleanup?.() }
  private install(value: unknown) {
    const next = parseYut(value), current = this.snapshot
    if (!next || this.stopped || this.owner !== this.transport.scope().userId
      || current && current.gameId !== next.gameId || current && next.version < current.version) return
    this.store.setState({ snapshot: next })
  }
  private async post(path: string, payload: Record<string, unknown>) {
    return this.transport.requestJSON(api + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  }
  async refresh() {
    if (this.stopped || this.owner !== this.transport.scope().userId) return
    const scope = this.transport.scope()
    this.store.setState({ connected: scope.connected })
    if (!scope.connected || !scope.channelId) { this.recovered = ''; return }
    try {
      const response = await this.transport.requestJSON(`${api}/rooms?channelId=${encodeURIComponent(scope.channelId)}`) as { rooms: YutRoom[]; mine: unknown }
      if (this.stopped) return
      if (Array.isArray(response.rooms)) this.store.setState({ rooms: response.rooms.filter(room => typeof room.gameId === 'string'
        && typeof room.name === 'string' && typeof room.hostNickname === 'string' && Number.isInteger(room.players)) })
      if (response.mine) {
        const mine = parseYut(response.mine)
        if (mine?.publicState.reason === 'YUT_CANCELLED') {
          await this.post('/leave', { gameId: mine.gameId })
          this.key = crypto.randomUUID()
          this.store.setState({ snapshot: null, error: '준비 중인 방이 닫혔어요. 새 방을 선택해주세요.' })
          return
        }
        this.install(response.mine)
        if (this.snapshot?.registered && this.snapshot.role === 'PLAYER' && this.recovered !== this.snapshot.gameId) {
          await this.recover()
        }
      } else if (!this.store.getState().pending && this.snapshot) {
        this.store.setState({ snapshot: null, error: '방이 닫혔어요. 다른 방을 선택해주세요.' })
        this.key = crypto.randomUUID()
      }
    } catch { if (!this.stopped) this.store.setState({ error: '방 정보를 불러오지 못했어요. 연결을 확인하고 새로고침해주세요.' }) }
  }
  private async recover() {
    await this.transport.request('GAME_RECONNECT_CHECK', {}, ['GAME_CONNECTION_STATE'])
    this.recovered = this.snapshot?.gameId ?? ''
  }
  private async run(work: () => Promise<unknown>) {
    if (this.store.getState().pending || this.stopped) return
    this.store.setState({ pending: true, error: '' })
    try { await work() }
    catch (error) {
      const failure = error as { message?: string; code?: string }
      this.store.setState({ error: failure.code === 'GAME_ACTION_STALE_VERSION' ? '상태가 바뀌었어요. 이동권과 말을 다시 선택해주세요.'
        : failure.code === 'GAME_RECOVERY_REQUIRED' ? '연결을 복구한 뒤 다시 시도해주세요.' : failure.message ?? '요청을 확인하지 못했어요. 다시 시도해주세요.' })
    } finally { if (!this.stopped) { this.store.setState({ pending: false }); await this.refresh() } }
  }
  create(roomName: string, rules: YutRules) {
    return this.run(async () => { this.install(await this.post('/rooms', { channelId: this.transport.scope().channelId,
      requestKey: this.key, roomName, rules })) })
  }
  join(gameId: string, watch = false) {
    return this.run(async () => { this.install(await this.post(watch ? '/watch' : '/rooms', { gameId, channelId: this.transport.scope().channelId })) })
  }
  lobby(input: Record<string, unknown>) {
    return this.run(async () => { this.install(await this.post('/lobby', { gameId: this.snapshot!.gameId, input })) })
  }
  begin() {
    return this.run(async () => { this.install(await this.post('/start', { gameId: this.snapshot!.gameId })); await this.recover() })
  }
  act(input: Record<string, unknown>) {
    if (this.command || !this.snapshot) return
    this.command = { gameId: this.snapshot.gameId, actionId: crypto.randomUUID(), expectedVersion: this.snapshot.version, input }
    return this.retry()
  }
  retry() {
    return this.run(async () => {
      if (!this.command) return
      try {
        await this.transport.request('GAME_ACTION_SEND', this.command, ['GAME_ACTION_RESULT'])
        this.command = undefined
        this.store.setState({ uncertain: false })
      } catch (error) {
        const code = (error as { code?: string }).code
        if (code?.startsWith('GAME_ACTION_') || code === 'GAME_RECOVERY_REQUIRED') {
          this.command = undefined
          this.store.setState({ uncertain: false })
          if (code === 'GAME_RECOVERY_REQUIRED') await this.recover()
        } else this.store.setState({ uncertain: true })
        throw error
      }
    })
  }
  feedback(text: string) { return this.run(async () => { await this.post('/feedback', { gameId: this.snapshot!.gameId, text }) }) }
  async leave(forfeit = false) {
    await this.run(async () => {
      const snapshot = this.snapshot
      if (!snapshot) return
      if (forfeit && snapshot.publicState.phase === 'PLAYING' && snapshot.role === 'PLAYER') {
        await this.transport.request('GAME_FORFEIT', { gameId: snapshot.gameId, actionId: crypto.randomUUID() }, ['GAME_FORFEIT_RESULT'])
      }
      if (snapshot.registered && snapshot.role === 'PLAYER') await this.recover()
      await this.post('/leave', { gameId: snapshot.gameId })
      this.command = undefined
      this.store.setState({ snapshot: null, uncertain: false })
      this.key = crypto.randomUUID()
    })
    return !this.snapshot
  }
}
