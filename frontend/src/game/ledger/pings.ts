import { create } from 'zustand'
import { integer, record, type Envelope } from '../../network/protocol'
import { CATEGORY_LABEL, isCategory, type LedgerCategory, type LedgerPingTarget } from './protocol'

export interface LedgerPingScope { key: string; gameId: string; version: number; role: 'PLAYER' | 'SPECTATOR'; canSend: boolean }
export interface LedgerPing {
  gameId: string; eventId: string; senderUserId: string; basedOnVersion: number
  category: LedgerCategory | null; dieId: number | null; until: number
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const throttle = '훈수는 1초 간격으로 보낼 수 있어요.'

/** Same Unix-ms contract as the omok ping; exactly one of category or dieId is set. */
export function parseLedgerPing(message: Envelope): Omit<LedgerPing, 'until'> & { remaining: number } | null {
  if (message.type !== 'DICE_LEDGER_SPECTATOR_PING') return null
  const p = message.payload
  if (typeof p.gameId !== 'string' || !p.gameId || typeof p.eventId !== 'string' || !uuid.test(p.eventId)
    || typeof p.senderUserId !== 'string' || !/^[1-9]\d*$/.test(p.senderUserId) || !integer(p.basedOnVersion)
    || !integer(p.sentAt) || !integer(p.expiresAt) || !integer(p.serverNow)) return null
  const category = p.category ?? null, dieId = p.dieId ?? null
  if ((category === null) === (dieId === null) || (category !== null && !isCategory(category))
    || (dieId !== null && !(Number.isInteger(dieId) && Number(dieId) >= 0 && Number(dieId) <= 4))) return null
  const remaining = Number(p.expiresAt) - Number(p.serverNow)
  if (Number(p.serverNow) < Number(p.sentAt) || Number(p.expiresAt) - Number(p.sentAt) > 2000) return null
  return { gameId: p.gameId, eventId: p.eventId, senderUserId: p.senderUserId, basedOnVersion: p.basedOnVersion as number,
    category: category as LedgerCategory | null, dieId: dieId as number | null, remaining }
}

interface View { scope: string; canSend: boolean; pings: LedgerPing[]; sending: boolean; readyAt: number; notice: string; error: string }
const initial = (): View => ({ scope: '', canSend: false, pings: [], sending: false, readyAt: 0, notice: '', error: '' })
export const useLedgerPings = create<View>(initial)
interface Dependencies {
  scope(): LedgerPingScope | null
  request(type: string, payload: Record<string, unknown>, expected: readonly string[], onId: (id: string) => void): Promise<Envelope>
  now?(): number
}
/** Ephemeral hints from approved spectators; never changes game state, timer or turn authority. */
export class LedgerPingEvents {
  private scope: LedgerPingScope | null = null
  private pings: LedgerPing[] = []
  private seen = new Map<string, number>()
  private requests = new Set<string>()
  private timer: ReturnType<typeof setTimeout> | undefined
  private last = -Infinity
  private pending = false
  private blocked = false
  private notice: { text: string; until: number } | null = null
  constructor(private readonly deps: Dependencies) {}
  private now() { return this.deps.now?.() ?? performance.now() }
  reset() {
    clearTimeout(this.timer); this.scope = null; this.pings = []; this.seen.clear(); this.last = -Infinity
    this.pending = false; this.blocked = false; this.notice = null
    useLedgerPings.setState(initial())
  }
  sync() {
    const next = this.deps.scope()
    if (next?.key !== this.scope?.key) { this.reset(); this.scope = next; this.publish() }
    else if (next && (next.version !== this.scope?.version || next.canSend !== this.scope?.canSend)) {
      this.scope = next; this.pings = this.pings.filter(p => p.basedOnVersion >= next.version); this.publish()
    }
  }
  private publish() {
    const now = this.now(), s = this.scope
    this.pings = this.pings.filter(p => p.until > now)
    for (const [id, until] of this.seen) if (until <= now) this.seen.delete(id)
    if (this.notice && this.notice.until <= now) this.notice = null
    const readyAt = this.last + 1000 > now ? this.last + 1000 : 0
    if (!readyAt && useLedgerPings.getState().error === throttle) useLedgerPings.setState({ error: '' })
    useLedgerPings.setState({ scope: s?.key ?? '', canSend: s?.role === 'SPECTATOR' && s.canSend && !this.blocked,
      pings: this.pings.filter(p => p.basedOnVersion === s?.version), sending: this.pending, readyAt,
      notice: this.notice?.text ?? '' })
    clearTimeout(this.timer)
    const expiry = Math.min(...this.pings.map(p => p.until), readyAt || Infinity, this.notice?.until ?? Infinity)
    if (Number.isFinite(expiry)) this.timer = setTimeout(() => this.publish(), Math.max(1, expiry - now))
  }
  accept(message: Envelope) {
    if (message.type === 'ERROR') return !!message.requestId && this.requests.has(message.requestId)
    if (message.type !== 'DICE_LEDGER_SPECTATOR_PING') return false
    this.sync()
    const event = parseLedgerPing(message), scope = this.scope, now = this.now()
    if (!event || !scope || event.gameId !== scope.gameId || this.seen.has(event.eventId) || event.remaining <= 0) return true
    this.seen.set(event.eventId, now + 30_000)
    if (this.seen.size > 256) this.seen.delete(this.seen.keys().next().value!)
    if (event.basedOnVersion >= scope.version) {
      const { remaining, ...ping } = event
      this.pings = [...this.pings.filter(p => p.senderUserId !== ping.senderUserId), { ...ping, until: now + remaining }].slice(-5)
    }
    this.publish(); return true
  }
  async send(target: LedgerPingTarget) {
    this.sync()
    const scope = this.scope
    if (!scope?.canSend || scope.role !== 'SPECTATOR' || this.blocked) return false
    if (this.pending || this.now() - this.last < 1000) { useLedgerPings.setState({ error: throttle }); return false }
    const eventId = crypto.randomUUID(), requestIds: string[] = []
    this.pending = true
    useLedgerPings.setState({ error: '', sending: true })
    try {
      const response = await this.deps.request('DICE_LEDGER_SPECTATOR_PING_SEND',
        { gameId: scope.gameId, eventId, basedOnVersion: scope.version, ...target }, ['DICE_LEDGER_SPECTATOR_PING'],
        id => { requestIds.push(id); this.requests.add(id) })
      if (this.deps.scope()?.key !== scope.key) return false
      const event = parseLedgerPing(response)
      if (!event || event.eventId !== eventId) throw new Error('훈수 승인 응답을 확인해주세요.')
      this.last = this.now()
      this.notice = { text: `${event.category ? `‘${CATEGORY_LABEL[event.category]}’ 칸` : `${event.dieId! + 1}번 주사위`} 훈수를 보냈어요.`,
        until: this.now() + 2500 }
      this.accept(response)
      return true
    } catch (error) {
      if (this.deps.scope()?.key !== scope.key) return false
      const code = record(error) ? String(error.code) : ''
      if (['GAME_SPECTATOR_ACCESS_DENIED', 'GAME_SPECTATOR_AUTH_REQUIRED', 'GAME_SPECTATOR_NOT_CONFIGURED',
        'GAME_SPECTATOR_UNSUPPORTED_GAME', 'GAME_SPECTATOR_GAME_NOT_PLAYING'].includes(code)) this.blocked = true
      useLedgerPings.setState({ error: code === 'DICE_LEDGER_SPECTATOR_PING_STALE_VERSION' ? '최신 장부가 표시된 뒤 다시 훈수해주세요.'
        : code === 'OMOK_SPECTATOR_PING_TOO_FREQUENT' ? throttle
        : error instanceof Error ? error.message : '전송하지 못했어요. 자동으로 다시 보내지 않습니다.' })
      this.publish(); return false
    } finally {
      requestIds.forEach(id => this.requests.delete(id))
      if (this.scope?.key === scope.key) { this.pending = false; this.publish() }
    }
  }
}
