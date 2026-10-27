import { create } from 'zustand'
import { useSession } from '../../network/worldClient'
import { integer, type Envelope } from '../../network/protocol'
import { ServerError } from '../../network/socketClient'
import { tableBusy } from '../../game/store'
import { gameSelection, TABLE_GAMES } from './model'
import { bindTablePreparation, manualStartAllowed, type PreparationContext, type PreparationSelection } from './tabletModel'
import { bindHostStartWait, useHostStartWait, type HostWaitSnapshot, type HostTimeoutReceipt } from './hostStartWait'

export const useTabletStartStatus = create(() => ({ tableId: '', uncertain: false }))
interface Dependencies {
  connected(): boolean
  request(type: string, payload: Record<string, unknown>, expected: readonly string[]): Promise<Envelope>
  action(job: () => Promise<unknown>): Promise<boolean>
}
const id = (value: unknown): value is string => typeof value === 'string' && !!value.trim() && value.length <= 120
const nullableId = (value: unknown) => value === null || id(value)
export function parseHostWait(p: Record<string, unknown>) {
  if (!id(p.tableId) || !id(p.epoch) || !integer(p.revision) || !integer(p.tableVersion) || !nullableId(p.hostUserId)
    || !integer(p.serverNow) || !(p.expiresAt === null || integer(p.expiresAt))
    || (p.expiresAt !== null && p.hostUserId === null)
    || !(p.cancelReason === null || ['NOT_READY', 'SETTINGS_OR_MEMBERSHIP_CHANGED', 'START_APPROVED', 'HOST_START_TIMEOUT'].includes(String(p.cancelReason))))
    throw new Error('방장 대기시간 응답을 확인할 수 없습니다.')
  return p as unknown as HostWaitSnapshot & { tableId: string; epoch: string }
}
export function parseHostTimeout(p: Record<string, unknown>) {
  if (!id(p.tableId) || !id(p.epoch) || !id(p.eventId) || !integer(p.revision) || !integer(p.tableVersion)
    || !id(p.previousHostUserId) || !nullableId(p.nextHostUserId) || p.nextHostUserId === p.previousHostUserId
    || p.reason !== 'HOST_START_TIMEOUT' || !integer(p.serverNow)) throw new Error('방장 시간 초과 안내를 확인할 수 없습니다.')
  return p as unknown as HostTimeoutReceipt & { tableId: string; epoch: string }
}
/** docs/tablet-lobby-api.md. Solely uses the existing authenticated RawWS connection. */
export class TabletLobbyClient {
  private unbind: (() => void) | null = null
  private feed: ReturnType<typeof bindHostStartWait> | null = null
  private scope = ''; private tableId = ''; private epoch = ''; private retired = new Set<string>()
  private timeoutLeft = false; private waitChecking = false; private generation = 0
  private attempt: { scope: string; actionId: string; expectedVersion: number; resolved: boolean } | null = null
  constructor(private deps: Dependencies) {}
  begin() {
    this.unbind?.()
    this.unbind = bindTablePreparation({ manualStart: true,
      selectedPlayers: table => table.startMode === 'MANUAL' ? table.selectedPlayers ?? null : null,
      configure: (context, selection) => this.configure(context, selection),
      start: context => this.start(context), recoverStart: context => this.recoverStart(context) })
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.visible)
  }
  end() {
    this.reset(); this.unbind?.(); this.unbind = null
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.visible)
  }
  reset(preserveAttempt = false) {
    ++this.generation; this.feed?.dispose(); this.feed = null; this.scope = ''; this.tableId = ''; this.epoch = ''
    this.retired.clear(); this.timeoutLeft = false; this.waitChecking = false
    if (!preserveAttempt) this.attempt = null
    useTabletStartStatus.setState({ tableId: '', uncertain: false })
  }
  private currentScope() {
    const s = useSession.getState()
    return JSON.stringify([s.sessionId, s.roomId, s.tableId])
  }
  private ensureScope() {
    const s = useSession.getState()
    if (!this.deps.connected() || s.status !== 'connected' || !s.tableId || !s.tableStates[s.tableId]?.seats.some(seat => seat.userId === s.sessionId)) return false
    const key = this.currentScope()
    if (this.scope !== key || !useHostStartWait.getState().scope) {
      this.feed?.dispose(); this.scope = key; this.tableId = s.tableId; this.epoch = ''; this.retired.clear(); this.timeoutLeft = false
      this.feed = bindHostStartWait({ userId: s.sessionId, channelId: s.roomId, tableId: s.tableId })
      if (this.attempt && this.attempt.scope !== key) this.attempt = null
      if (this.attempt) useTabletStartStatus.setState({ tableId: s.tableId, uncertain: true })
      void this.checkWait()
    }
    return true
  }
  private useEpoch(epoch: string) {
    if (this.retired.has(epoch)) return false
    if (this.epoch && this.epoch !== epoch) {
      if (this.retired.size >= 64) return false
      this.retired.add(this.epoch)
      const s = useSession.getState()
      this.feed?.dispose()
      this.feed = bindHostStartWait({ userId: s.sessionId, channelId: s.roomId, tableId: this.tableId })
    }
    this.epoch = epoch
    return true
  }
  accept(message: Envelope) {
    const s = useSession.getState()
    if (!this.deps.connected() || s.status !== 'connected' || !s.roomId) { this.reset(true); return }
    if (message.type === 'TABLE_LEFT') {
      if (message.payload.tableId === this.tableId && message.payload.reason === 'HOST_START_TIMEOUT') this.timeoutLeft = true
      else this.reset()
      return
    }
    if (message.type === 'CHANNEL_LEFT') { this.reset(); return }
    if (['TABLE_STATE', 'CHANNEL_STATE'].includes(message.type)) this.ensureScope()
    if (message.type === 'TABLE_HOST_WAIT_STATE') {
      const p = parseHostWait(message.payload)
      if (!s.tableId || p.tableId !== s.tableId || !this.ensureScope() || !this.useEpoch(p.epoch)) return
      this.feed?.update(p)
    }
    if (message.type === 'TABLE_HOST_TIMEOUT') {
      const p = parseHostTimeout(message.payload)
      const previousScope = this.scope ? JSON.parse(this.scope) as string[] : []
      if (p.tableId !== this.tableId || previousScope[0] !== s.sessionId || previousScope[1] !== s.roomId
        || (s.tableId !== p.tableId && !(this.timeoutLeft && p.previousHostUserId === s.sessionId)) || !this.useEpoch(p.epoch)) return
      this.feed?.timeout(p)
    }
    if (message.type === 'GAME_START_STATE' && this.attempt && message.payload.tableId === this.tableId) {
      if (message.payload.phase === 'WAITING' && this.attempt.resolved) this.attempt = null
      else if (message.payload.phase !== 'WAITING') this.attempt.resolved = true
      useTabletStartStatus.setState({ tableId: '', uncertain: false })
    }
  }
  private visible = () => { if (document.visibilityState === 'visible') void this.checkWait() }
  private async checkWait() {
    const s = useSession.getState()
    if (this.waitChecking || !this.deps.connected() || s.status !== 'connected' || s.tableId !== this.tableId
      || s.tableStates[s.tableId]?.startMode !== 'MANUAL') return
    const generation = this.generation
    this.waitChecking = true
    try { await this.deps.request('TABLE_HOST_WAIT_CHECK', {}, ['TABLE_HOST_WAIT_STATE']) }
    catch { /* No action replay or timer guess after a failed read. */ }
    finally { if (generation === this.generation) this.waitChecking = false }
  }
  private table(context: PreparationContext, exactVersion = true) {
    const s = useSession.getState(), table = s.tableStates[s.tableId]
    if (!this.deps.connected() || s.status !== 'connected' || !table || tableBusy()
      || context.userId !== s.sessionId || context.channelId !== s.roomId || context.tableId !== s.tableId
      || !table.seats.some(seat => seat.userId === s.sessionId) || (exactVersion && context.expectedVersion !== table.version))
      throw new Error('최신 테이블 상태를 확인한 뒤 다시 시도해주세요.')
    return table
  }
  private configure(context: PreparationContext, selection: PreparationSelection) {
    return this.deps.action(async () => {
      const table = this.table(context), max = TABLE_GAMES.find(g => g.code === selection.gameCode)?.capacity ?? 0
      if (table.selectorUserId !== context.userId || !Number.isInteger(selection.playerCount)
        || selection.playerCount < 2 || selection.playerCount > max || selection.playerCount < table.seats.filter(s => s.userId).length)
        throw new Error('방장과 선택 인원을 확인해주세요.')
      await this.deps.request('TABLE_CONFIGURE', { ...gameSelection(selection.gameCode, selection.betAmountPerPlayer, selection.targetScore),
        selectedPlayers: selection.playerCount, expectedVersion: context.expectedVersion }, ['TABLE_STATE'])
      this.attempt = null; useTabletStartStatus.setState({ tableId: '', uncertain: false })
      void this.checkWait()
    })
  }
  private start(context: PreparationContext) {
    return this.deps.action(async () => {
      const table = this.table(context, false), key = this.currentScope()
      if (table.startMode !== 'MANUAL' || !manualStartAllowed(table, context.userId, table.selectedPlayers ?? null))
        throw new Error('선택 인원이 모두 준비한 뒤 방장이 시작해주세요.')
      if (!this.attempt || this.attempt.scope !== key) this.attempt = { scope: key, actionId: crypto.randomUUID(), expectedVersion: table.version, resolved: false }
      const attempt = this.attempt
      try {
        await this.deps.request('TABLE_START', { actionId: attempt.actionId, expectedVersion: attempt.expectedVersion }, ['GAME_START_STATE'])
        useTabletStartStatus.setState({ tableId: '', uncertain: false })
      } catch (error) {
        if (this.attempt === attempt) {
          if (attempt.resolved) return
          if (error instanceof ServerError) this.attempt = null
          else useTabletStartStatus.setState({ tableId: context.tableId, uncertain: true })
        }
        throw error
      }
    })
  }
  private recoverStart(context: PreparationContext) {
    return this.deps.action(async () => {
      const s = useSession.getState()
      if (!this.deps.connected() || s.sessionId !== context.userId || s.roomId !== context.channelId || s.tableId !== context.tableId)
        throw new Error('참가 중인 테이블을 확인해주세요.')
      const response = await this.deps.request('GAME_START_CHECK', {}, ['GAME_START_STATE'])
      if (response.payload.tableId !== context.tableId) throw new Error('테이블 시작 상태를 확인할 수 없습니다.')
      if (response.payload.phase === 'WAITING') this.attempt = null
      useTabletStartStatus.setState({ tableId: '', uncertain: false })
    })
  }
}
