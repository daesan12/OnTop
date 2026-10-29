import { selectedCardTarget } from './selectedCardTarget'
import { create } from 'zustand'
import { integer, record, type Envelope } from '../../network/protocol'
import { ONECARD_PRANKS_ENABLED, type PrankScope } from './prankEvents'

export const ONECARD_DEFENSE_ENABLED = import.meta.env.VITE_ONECARD_PRANK_DEFENSE !== 'false' && ONECARD_PRANKS_ENABLED
export const PRANK_BLOCK_MS = 3000
export const PRANK_REACH_MS = 3200
export interface Reach { attemptId: string; actorUserId: string; targetUserId: string; turnCount: number; until: number; startedAt: number; duration: number; cardIndex?: number }
interface Block extends Reach { eventId: string }
interface View { scope: string; enabled: boolean; pending: boolean; error: string; attempts: Reach[]; blocks: Record<string, number>; lastBlock: Block | null; usedTurn: string }
const initial = (): View => ({ scope: '', enabled: false, pending: false, error: '', attempts: [], blocks: {}, lastBlock: null, usedTurn: '' })
export const useOneCardDefense = create<View>(initial)
const id = (value: unknown): value is string => typeof value === 'string' && !!value.trim() && value.length <= 120
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
const pair = (actor: string, target: string) => `${actor}/${target}`
interface Dependencies {
  enabled: boolean; scope(): PrankScope | null; canReach(target: string): boolean; now?(): number
  request(type: string, payload: Record<string, unknown>, expected: readonly string[], onId: (id: string) => void): Promise<Envelope>
}
/** Server-confirmed two-phase contract. No local hit, timer, or error can grant a block or flip. */
export class OneCardDefenseEvents {
  private scope: PrankScope | null = null
  private seen = new Set<string>()
  private requests = new Set<string>()
  private recent = new Map<string, Reach>()
  private unavailable = false
  private now() { return this.deps.now?.() ?? performance.now() }
  constructor(private readonly deps: Dependencies) {}
  reset() { this.scope = null; this.seen.clear(); this.recent.clear(); this.unavailable = false; useOneCardDefense.setState(initial()) }
  sync() {
    const next = this.deps.enabled ? this.deps.scope() : null
    if (next?.key !== this.scope?.key) { this.reset(); this.scope = next; useOneCardDefense.setState({ scope: next?.key ?? '', enabled: !!next }) }
    else this.scope = next
    const state = useOneCardDefense.getState(), enabled = !!next && !this.unavailable && (next.role === 'PLAYER' ? next.canRestore : next.canSend)
    for (const [key, attempt] of this.recent) if (attempt.until + 5000 < this.now()) this.recent.delete(key)
    const attempts = state.attempts.filter(a => a.turnCount === next?.turnCount && a.targetUserId === next.turnUserId && a.until > this.now())
    if (enabled !== state.enabled || attempts.length !== state.attempts.length) useOneCardDefense.setState({ enabled, attempts })
  }
  accept(message: Envelope) {
    if (message.type === 'ERROR') return !!message.requestId && this.requests.has(message.requestId)
    if (!['ONECARD_PRANK_REACH_STARTED', 'ONECARD_PRANK_BLOCKED', 'ONECARD_PRANK_REACH_RESOLVED'].includes(message.type)) return false
    this.sync()
    const scope = this.scope, p = message.payload
    if (!scope || this.unavailable || p.gameId !== scope.gameId || !uuid(p.eventId)
      || this.seen.has(p.eventId) || !uuid(p.attemptId) || !id(p.actorUserId) || !id(p.targetUserId)
      || !integer(p.turnCount) || !integer(p.serverNow) || p.actorUserId === p.targetUserId
      || scope.role === 'PLAYER' && p.targetUserId !== scope.ownId) return true
    const state = useOneCardDefense.getState()
    if (message.type === 'ONECARD_PRANK_REACH_STARTED') {
      if (p.turnCount !== scope.turnCount || p.targetUserId !== scope.turnUserId || !integer(p.resolveAt)
        || p.resolveAt <= p.serverNow || p.resolveAt - p.serverNow > PRANK_REACH_MS
        || state.attempts.some(a => a.attemptId === p.attemptId)
        || (state.blocks[pair(p.actorUserId, p.targetUserId)] ?? 0) > this.now()) return true
      const attempt: Reach = { attemptId: p.attemptId, actorUserId: p.actorUserId, targetUserId: p.targetUserId,
        turnCount: p.turnCount, until: this.now() + p.resolveAt - p.serverNow, startedAt: this.now(), duration: p.resolveAt - p.serverNow,
        ...(Number.isInteger(p.cardIndex) ? { cardIndex: p.cardIndex as number } : {}) }
      this.recent.set(attempt.attemptId, attempt)
      if (this.recent.size > 32) this.recent.delete(this.recent.keys().next().value!)
      useOneCardDefense.setState({ attempts: [...state.attempts.slice(-3), attempt], error: '',
        ...(p.actorUserId === scope.ownId ? { usedTurn: `${p.targetUserId}/${p.turnCount}` } : {}) })
    } else if (message.type === 'ONECARD_PRANK_BLOCKED') {
      if (!integer(p.blockedUntil) || p.blockedUntil <= p.serverNow || p.blockedUntil - p.serverNow > PRANK_BLOCK_MS) return true
      const known = this.recent.get(p.attemptId)
      if (!known || known.actorUserId !== p.actorUserId || known.targetUserId !== p.targetUserId || known.turnCount !== p.turnCount) return true
      const until = this.now() + p.blockedUntil - p.serverNow
      useOneCardDefense.setState({ attempts: state.attempts.filter(a => a.attemptId !== p.attemptId), error: '',
        blocks: { ...state.blocks, [pair(p.actorUserId, p.targetUserId)]: Math.max(state.blocks[pair(p.actorUserId, p.targetUserId)] ?? 0, until) },
        lastBlock: { ...known, eventId: p.eventId, until } })
      this.recent.delete(p.attemptId)
    } else {
      if (!['FLIPPED', 'BLOCKED', 'CANCELLED'].includes(String(p.outcome))) return true
      useOneCardDefense.setState({ attempts: state.attempts.filter(a => a.attemptId !== p.attemptId) })
      if (p.outcome !== 'BLOCKED') this.recent.delete(p.attemptId)
    }
    this.seen.add(p.eventId)
    if (this.seen.size > 256) this.seen.delete(this.seen.values().next().value!)
    return true
  }
  canReach(target: string) {
    this.sync()
    const scope = this.scope, state = useOneCardDefense.getState()
    return !!scope && scope.role === 'SPECTATOR' && scope.canSend && state.enabled && !state.pending
      && this.deps.canReach(target) && !state.attempts.some(a => a.actorUserId === scope.ownId)
      && state.usedTurn !== `${target}/${scope.turnCount}` && (state.blocks[pair(scope.ownId, target)] ?? 0) <= this.now()
  }
  reach(targetUserId: string, cardIndex?: number, handVersion?: number) {
    if (!this.canReach(targetUserId) || !this.scope) return Promise.resolve(false)
    const selected = selectedCardTarget(cardIndex, handVersion, this.scope)
    if (!selected) return Promise.resolve(false)
    return this.send('ONECARD_PRANK_REACH_SEND', { gameId: this.scope.gameId, eventId: crypto.randomUUID(), targetUserId,
      turnCount: this.scope.turnCount, ...selected }, 'ONECARD_PRANK_REACH_STARTED')
  }
  hit(attemptId: string) {
    this.sync()
    const scope = this.scope, state = useOneCardDefense.getState(), attempt = state.attempts.find(a => a.attemptId === attemptId)
    if (!scope || scope.role !== 'PLAYER' || !scope.canRestore || !state.enabled || state.pending
      || !attempt || attempt.targetUserId !== scope.ownId || attempt.until <= this.now()) return Promise.resolve(false)
    return this.send('ONECARD_PRANK_HIT_SEND', { gameId: scope.gameId, eventId: crypto.randomUUID(), attemptId }, 'ONECARD_PRANK_BLOCKED')
  }
  private async send(type: string, payload: Record<string, unknown>, expected: string) {
    const key = this.scope?.key, requests: string[] = []
    useOneCardDefense.setState({ pending: true, error: '' })
    try {
      const reply = await this.deps.request(type, payload, [expected], requestId => { this.requests.add(requestId); requests.push(requestId) })
      this.sync()
      if (this.scope?.key !== key) return false
      if (reply.type !== expected || reply.payload.eventId !== payload.eventId || reply.payload.gameId !== payload.gameId)
        throw new Error('방해 동작 승인 응답을 확인하지 못했어요.')
      this.accept(reply)
      if (!this.seen.has(String(payload.eventId))) throw new Error('방해 동작 응답 형식을 확인하지 못했어요.')
      return true
    } catch (error) {
      this.sync()
      if (this.scope?.key !== key) return false
      const code = record(error) ? String(error.code) : ''
      if (['ONECARD_DEFENSE_NOT_CONFIGURED', 'ONECARD_PRANK_ACCESS_DENIED'].includes(code)) this.unavailable = true
      useOneCardDefense.setState({ enabled: !this.unavailable, error: error instanceof Error ? error.message : '방해 동작을 확인하지 못했어요. 자동 재전송하지 않아요.' })
      return false
    } finally {
      requests.forEach(requestId => this.requests.delete(requestId))
      if (this.scope?.key === key) useOneCardDefense.setState({ pending: false })
    }
  }
}
