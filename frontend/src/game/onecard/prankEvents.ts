import { create } from 'zustand'
import { integer, record, type Envelope } from '../../network/protocol'
import { flipCandidates } from './uiState'

export const ONECARD_PRANKS_ENABLED = import.meta.env.VITE_ONECARD_PRANKS === 'true'
export const RESTORE_IMMUNITY_MS = 2500
export interface PrankScope {
  key: string; gameId: string; ownId: string; role: 'PLAYER' | 'SPECTATOR'; turnCount: number
  turnUserId: string | null; canSend: boolean; canRestore: boolean; handIds: readonly string[]; protectedId: string
}
interface Effect { eventId: string; targetUserId: string; turnCount: number; count: number }
interface View {
  scope: string; enabled: boolean; pending: boolean; error: string; effect: Effect | null
  flippedIds: string[]; usedTurn: string; immune: Record<string, number>
}
const initial = (): View => ({ scope: '', enabled: false, pending: false, error: '', effect: null, flippedIds: [], usedTurn: '', immune: {} })
export const useOneCardPranks = create<View>(initial)
interface Dependencies {
  enabled: boolean; scope(): PrankScope | null
  request(type: string, payload: Record<string, unknown>, expected: readonly string[], onId: (id: string) => void): Promise<Envelope>
  now?(): number
}
const id = (v: unknown): v is string => typeof v === 'string' && !!v.trim() && v.length <= 120
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
/** Proposed BE contract. The production flag stays off until BE confirms and deploys it. */
export class OneCardPrankEvents {
  private scope: PrankScope | null = null
  private seen = new Set<string>()
  private requests = new Set<string>()
  private blocked = false
  private now() { return this.deps.now?.() ?? performance.now() }
  constructor(private readonly deps: Dependencies) {}
  reset() { this.scope = null; this.seen.clear(); this.blocked = false; useOneCardPranks.setState(initial()) }
  sync() {
    const next = this.deps.enabled ? this.deps.scope() : null
    if (next?.key !== this.scope?.key) { this.reset(); this.scope = next; useOneCardPranks.setState({ scope: next?.key ?? '', enabled: !!next }) }
    else this.scope = next
    const enabled = !!next && !this.blocked && (next.role === 'PLAYER' || next.canSend)
    if (useOneCardPranks.getState().enabled !== enabled) useOneCardPranks.setState({ enabled })
    const state = useOneCardPranks.getState()
    if (state.effect && (state.effect.turnCount !== next?.turnCount || state.effect.targetUserId !== next?.turnUserId))
      useOneCardPranks.setState({ effect: null, flippedIds: [] })
  }
  accept(message: Envelope) {
    if (message.type === 'ERROR') return !!message.requestId && this.requests.has(message.requestId)
    if (!['ONECARD_HAND_FLIPPED', 'ONECARD_HAND_RESTORED'].includes(message.type)) return false
    this.sync()
    const p = message.payload, scope = this.scope
    if (!scope || p.gameId !== scope.gameId || !uuid(p.eventId) || this.seen.has(p.eventId)
      || !id(p.targetUserId) || !integer(p.turnCount) || !integer(p.serverNow)) return true
    if (message.type === 'ONECARD_HAND_FLIPPED') {
      if (p.turnCount !== scope.turnCount || p.targetUserId !== scope.turnUserId || ![1, 2].includes(Number(p.count))
        || typeof p.count !== 'number' || useOneCardPranks.getState().effect
        || useOneCardPranks.getState().usedTurn === `${p.targetUserId}/${p.turnCount}`
        || (useOneCardPranks.getState().immune[p.targetUserId] ?? 0) > this.now()) return true
      const effect: Effect = { eventId: p.eventId, targetUserId: p.targetUserId, turnCount: p.turnCount, count: p.count }
      const flippedIds = scope.ownId === p.targetUserId && scope.role === 'PLAYER'
        ? flipCandidates(scope.handIds, scope.protectedId, p.count) : []
      useOneCardPranks.setState({ effect, flippedIds, usedTurn: `${p.targetUserId}/${p.turnCount}`, error: '' })
      if (scope.ownId === p.targetUserId && !flippedIds.length) void this.restore()
    } else {
      if (!uuid(p.effectId) || !integer(p.immuneUntil) || p.immuneUntil < p.serverNow
        || p.immuneUntil - p.serverNow > RESTORE_IMMUNITY_MS) return true
      const state = useOneCardPranks.getState()
      // A late restore must never remove a newer effect.
      if (state.effect && state.effect.eventId !== p.effectId) return true
      useOneCardPranks.setState({ effect: null, flippedIds: [], immune: { ...state.immune,
        [p.targetUserId]: Math.max(state.immune[p.targetUserId] ?? 0, this.now() + p.immuneUntil - p.serverNow) } })
    }
    this.seen.add(p.eventId)
    if (this.seen.size > 256) this.seen.delete(this.seen.values().next().value!)
    return true
  }
  canFlip(targetUserId: string) {
    this.sync()
    const scope = this.scope, state = useOneCardPranks.getState()
    return !!scope?.canSend && scope.role === 'SPECTATOR' && !this.blocked && !state.pending && !state.effect
      && targetUserId === scope.turnUserId && state.usedTurn !== `${targetUserId}/${scope.turnCount}`
      && (state.immune[targetUserId] ?? 0) <= this.now()
  }
  async flip(targetUserId: string) {
    if (!this.canFlip(targetUserId) || !this.scope) return false
    const scope = this.scope
    return this.send('ONECARD_HAND_FLIP_SEND', { gameId: scope.gameId, eventId: crypto.randomUUID(), targetUserId, turnCount: scope.turnCount }, 'ONECARD_HAND_FLIPPED')
  }
  async restore() {
    this.sync()
    const scope = this.scope, state = useOneCardPranks.getState(), effect = state.effect
    if (!scope?.canRestore || scope.role !== 'PLAYER' || effect?.targetUserId !== scope.ownId) return false
    // Restore all pages immediately. No network round trip, retry, or acknowledgement can turn them back over.
    useOneCardPranks.setState({ effect: null, flippedIds: [], immune: { ...state.immune, [scope.ownId]: this.now() + RESTORE_IMMUNITY_MS } })
    return this.send('ONECARD_HAND_RESTORE_SEND', { gameId: scope.gameId, eventId: crypto.randomUUID(), effectId: effect.eventId }, 'ONECARD_HAND_RESTORED')
  }
  private async send(type: string, payload: Record<string, unknown>, expected: string) {
    const key = this.scope?.key, requests: string[] = []
    useOneCardPranks.setState({ pending: true, error: '' })
    try {
      const response = await this.deps.request(type, payload, [expected], requestId => { this.requests.add(requestId); requests.push(requestId) })
      this.sync()
      if (this.scope?.key !== key) return false
      if (response.type !== expected || response.payload.gameId !== payload.gameId || response.payload.eventId !== payload.eventId)
        throw new Error('장난 승인 응답을 확인하지 못했습니다.')
      this.accept(response)
      if (!this.seen.has(String(payload.eventId))) throw new Error('장난 응답 형식을 확인해주세요.')
      return true
    } catch (error) {
      this.sync()
      if (this.scope?.key !== key) return false
      const code = record(error) ? String(error.code) : ''
      if (['ONECARD_PRANK_NOT_CONFIGURED', 'ONECARD_PRANK_ACCESS_DENIED', 'ONECARD_PRANK_GAME_NOT_PLAYING'].includes(code)) this.blocked = true
      useOneCardPranks.setState({ enabled: !this.blocked, error: error instanceof Error ? error.message : '장난 요청을 처리하지 못했습니다. 자동 재전송하지 않습니다.' })
      return false
    } finally {
      requests.forEach(id => this.requests.delete(id))
      if (this.scope?.key === key) useOneCardPranks.setState({ pending: false })
    }
  }
}
