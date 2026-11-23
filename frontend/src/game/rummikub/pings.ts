import { create } from 'zustand'
import { type Envelope } from '../../network/protocol'

interface Scope { key: string; gameId: string; version: number; role: 'PLAYER' | 'SPECTATOR'; canSend: boolean }
interface Ping { gameId: string; eventId: string; senderUserId: string; basedOnVersion: number; meldIndex: number; until: number }
export const useRummikubPings = create<{ pings: Ping[]; canSend: boolean; error: string }>(() => ({ pings: [], canSend: false, error: '' }))
export class RummikubPingEvents {
  private key = ''
  private last = -Infinity
  private seen = new Set<string>()
  private timer: ReturnType<typeof setTimeout> | undefined
  private pending = false
  constructor(private readonly deps: {
    scope(): Scope | null
    request(type: string, payload: Record<string, unknown>, expected: readonly string[]): Promise<Envelope>
  }) { }
  reset() {
    clearTimeout(this.timer); this.key = ''; this.last = -Infinity; this.seen.clear(); this.pending = false
    useRummikubPings.setState({ pings: [], canSend: false, error: '' })
  }
  sync() {
    const scope = this.deps.scope()
    if ((scope?.key ?? '') !== this.key) { this.reset(); this.key = scope?.key ?? '' }
    const pings = useRummikubPings.getState().pings.filter(p => p.until > performance.now() && p.basedOnVersion === scope?.version)
    useRummikubPings.setState({ pings, canSend: !!scope?.canSend && scope.role === 'SPECTATOR' })
  }
  accept(message: Envelope) {
    if (message.type !== 'RUMMIKUB_SPECTATOR_PING') return false
    this.sync()
    const p = message.payload, scope = this.deps.scope()
    if (!scope || p.gameId !== scope.gameId || typeof p.eventId !== 'string' || this.seen.has(p.eventId)
      || typeof p.senderUserId !== 'string' || !/^[1-9]\d*$/.test(p.senderUserId) || p.basedOnVersion !== scope.version
      || !Number.isInteger(p.meldIndex) || Number(p.meldIndex) < 0 || Number(p.meldIndex) >= 35
      || ![p.sentAt, p.expiresAt, p.serverNow].every(Number.isSafeInteger)
      || Number(p.serverNow) < Number(p.sentAt) || Number(p.expiresAt) <= Number(p.serverNow)
      || Number(p.expiresAt) - Number(p.sentAt) > 2000) return true
    this.seen.add(p.eventId)
    if (this.seen.size > 256) this.seen.delete(this.seen.values().next().value!)
    const ping: Ping = { gameId: scope.gameId, eventId: p.eventId, senderUserId: p.senderUserId,
      basedOnVersion: scope.version, meldIndex: Number(p.meldIndex), until: performance.now() + Math.min(2000, Number(p.expiresAt) - Number(p.serverNow)) }
    useRummikubPings.setState(v => ({ pings: [...v.pings.filter(v => v.senderUserId !== ping.senderUserId), ping].slice(-5) }))
    clearTimeout(this.timer); this.timer = setTimeout(() => this.sync(), 2001)
    return true
  }
  async send(meldIndex: number) {
    this.sync()
    const scope = this.deps.scope(), key = this.key
    if (!scope || !useRummikubPings.getState().canSend || !Number.isInteger(meldIndex) || meldIndex < 0 || meldIndex > 34) return false
    if (this.pending || performance.now() - this.last < 1000) { useRummikubPings.setState({ error: '핑은 1초 간격으로 보낼 수 있어요.' }); return false }
    this.pending = true; this.last = performance.now()
    try {
      const response = await this.deps.request('RUMMIKUB_SPECTATOR_PING_SEND', { gameId: scope.gameId, basedOnVersion: scope.version, eventId: crypto.randomUUID(), meldIndex }, ['RUMMIKUB_SPECTATOR_PING'])
      if (this.key !== key) return false
      this.accept(response); useRummikubPings.setState({ error: '' }); return true
    } catch (error) {
      if (this.key === key) useRummikubPings.setState({ error: error instanceof Error ? error.message : '핑 전달에 실패했습니다.' })
      return false
    } finally { if (this.key === key) this.pending = false }
  }
}
