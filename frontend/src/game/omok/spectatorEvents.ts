import { create } from 'zustand'
import { integer, record, type Envelope } from '../../network/protocol'
import { omokCoordinate } from '../omokPresentation'

export interface EventScope { key: string; gameId: string; version: number; role: 'PLAYER' | 'SPECTATOR'; canSend: boolean }
interface BaseEvent { gameId: string; eventId: string; senderUserId: string; sentAt: number; expiresAt: number; serverNow: number; displayName?: string }
export type ChatEvent = BaseEvent & { kind: 'chat'; text: string }
export type PingEvent = BaseEvent & { kind: 'ping'; basedOnVersion: number; x: number; y: number }
export type DisplayEvent<T> = T & { until: number; slot: number }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const id = (v: unknown): v is string => typeof v === 'string' && !!v.trim() && v.length <= 120
const pingThrottleMessage = '추천은 1초 간격으로 보낼 수 있어요.'
export function spectatorText(value: string) {
  const text = value.trim()
  if (!text || [...text].length > 200 || /[\u0000-\u001f\u007f-\u009f\u2028\u2029\uD800-\uDFFF]/u.test(text))
    throw new Error('경기 채팅은 줄바꿈 없이 1~200자로 입력해주세요.')
  return text
}
/** Final BE contract: all three times are Unix milliseconds, never ISO strings. */
export function parseSpectatorEvent(message: Envelope): ChatEvent | PingEvent | null {
  const kind = message.type === 'GAME_SPECTATOR_CHAT_MESSAGE' ? 'chat' : message.type === 'OMOK_SPECTATOR_PING' ? 'ping' : null
  if (!kind) return null
  const p = message.payload
  if (!id(p.gameId) || typeof p.eventId !== 'string' || !uuid.test(p.eventId)
    || typeof p.senderUserId !== 'string' || !/^[1-9]\d*$/.test(p.senderUserId)
    || !integer(p.sentAt) || !integer(p.expiresAt) || !integer(p.serverNow)) return null
  const sentAt = p.sentAt as number, expiresAt = p.expiresAt as number, serverNow = p.serverNow as number
  if (serverNow < sentAt || expiresAt <= sentAt || expiresAt - sentAt > (kind === 'chat' ? 3000 : 2000)) return null
  const base = { gameId: p.gameId, eventId: p.eventId, senderUserId: p.senderUserId, sentAt, expiresAt, serverNow }
  if (kind === 'chat') {
    if (typeof p.text !== 'string') return null
    try { if (spectatorText(p.text) !== p.text) return null } catch { return null }
    return { ...base, kind, text: p.text }
  }
  if (!integer(p.basedOnVersion) || !Number.isInteger(p.x) || !Number.isInteger(p.y)
    || Number(p.x) < 0 || Number(p.x) > 14 || Number(p.y) < 0 || Number(p.y) > 14) return null
  return { ...base, kind, basedOnVersion: p.basedOnVersion as number, x: p.x as number, y: p.y as number }
}
interface View {
  scope: string; canSend: boolean; chats: DisplayEvent<ChatEvent>[]; pings: DisplayEvent<PingEvent>[]
  history: ChatEvent[]
  error: string; sending: boolean
  pingSending: boolean; pingReadyAt: number; pingNotice: string; pingError: string
}
const initial = (): View => ({ scope: '', canSend: false, chats: [], pings: [], history: [], error: '', sending: false,
  pingSending: false, pingReadyAt: 0, pingNotice: '', pingError: '' })
export const useOmokEvents = create<View>(initial)
interface Dependencies {
  displayName?(userId: string): string | undefined
  scope(): EventScope | null
  request(type: string, payload: Record<string, unknown>, expected: readonly string[], onId: (id: string) => void): Promise<Envelope>
  now?(): number
}
/** Ephemeral feed; never modifies game state, timer, action IDs or turn authority. */
export class OmokSpectatorEvents {
  private scope: EventScope | null = null
  private chats: DisplayEvent<ChatEvent>[] = []
  private history: ChatEvent[] = []
  private pings: DisplayEvent<PingEvent>[] = []
  private seen = new Map<string, number>()
  private timer: ReturnType<typeof setTimeout> | undefined
  private requests = new Set<string>()
  private last = { chat: -Infinity, ping: -Infinity }
  private pending = { chat: false, ping: false }
  private blocked = false
  private pingFeedback: { text: string; until: number } | null = null
  constructor(private readonly deps: Dependencies) {}
  private now() { return this.deps.now?.() ?? performance.now() }
  reset() {
    clearTimeout(this.timer); this.scope = null; this.chats = []; this.pings = []; this.history = []; this.seen.clear()
    this.last = { chat: -Infinity, ping: -Infinity }; this.pending = { chat: false, ping: false }; this.blocked = false
    this.pingFeedback = null
    useOmokEvents.setState(initial())
  }
  sync() {
    const next = this.deps.scope()
    if (next?.key !== this.scope?.key) { this.reset(); this.scope = next; this.publish() }
    else if (next && (next.version !== this.scope?.version || next.canSend !== this.scope?.canSend)) {
      this.scope = next; this.pings = this.pings.filter(p => p.basedOnVersion >= next.version); this.publish()
    }
    let changed = false
    const resolve = <T extends BaseEvent>(event: T): T => {
      const name = event.displayName ?? this.deps.displayName?.(event.senderUserId)
      if (!event.displayName && name) { changed = true; return { ...event, displayName: name } }
      return event
    }
    if (this.deps.displayName) {
      const history = this.history.map(resolve), chats = this.chats.map(resolve), pings = this.pings.map(resolve)
      if (changed) { this.history = history; this.chats = chats; this.pings = pings; this.publish() }
    }
  }
  private publish() {
    const now = this.now()
    this.chats = this.chats.filter(c => c.until > now)
    this.pings = this.pings.filter(p => p.until > now)
    for (const [id, until] of this.seen) if (until <= now) this.seen.delete(id)
    const s = this.scope
    const pingReadyAt = this.last.ping + 1000 > now ? this.last.ping + 1000 : 0
    if (this.pingFeedback && this.pingFeedback.until <= now) this.pingFeedback = null
    if (!pingReadyAt && !this.pending.ping && useOmokEvents.getState().pingError === pingThrottleMessage)
      useOmokEvents.setState({ pingError: '' })
    useOmokEvents.setState({ scope: s?.key ?? '', canSend: !!s?.canSend && !this.blocked,
      chats: this.chats, history: this.history, pings: this.pings.filter(p => p.basedOnVersion === s?.version),
      pingSending: this.pending.ping, pingReadyAt, pingNotice: this.pingFeedback?.text ?? '' })
    clearTimeout(this.timer)
    const expiry = Math.min(...this.chats.map(c => c.until), ...this.pings.map(p => p.until),
      pingReadyAt || Infinity, this.pingFeedback?.until ?? Infinity)
    if (Number.isFinite(expiry)) this.timer = setTimeout(() => this.publish(), Math.max(1, expiry - now))
  }
  accept(message: Envelope) {
    if (message.type === 'ERROR') {
      if (!message.requestId || !this.requests.has(message.requestId)) return false
      return true // The owning request handles the rejection, not the global game error path.
    }
    if (!['GAME_SPECTATOR_CHAT_MESSAGE', 'OMOK_SPECTATOR_PING'].includes(message.type)) return false
    this.sync()
    const event = parseSpectatorEvent(message), scope = this.scope, now = this.now()
    for (const [id, until] of this.seen) if (until <= now) this.seen.delete(id)
    if (!event || !scope || event.gameId !== scope.gameId || this.seen.has(event.eventId)) return true
    const remaining = event.expiresAt - event.serverNow
    if (remaining <= 0) return true
    event.displayName = this.deps.displayName?.(event.senderUserId)
    this.seen.set(event.eventId, now + 30_000)
    if (this.seen.size > 256) this.seen.delete(this.seen.keys().next().value!)
    if (event.kind === 'chat') {
      this.history = [...this.history, event].slice(-100)
      const slot = [0, 1, 2].find(n => !this.chats.some(c => c.until > now && c.slot === n)) ?? this.chats[0]?.slot ?? 0
      this.chats = [...this.chats.filter(c => c.slot !== slot), { ...event, until: now + remaining, slot }].slice(-3)
    } else if (event.basedOnVersion >= scope.version) {
      this.pings = [...this.pings.filter(p => p.senderUserId !== event.senderUserId), { ...event, until: now + remaining, slot: 0 }].slice(-5)
    }
    this.publish(); return true
  }
  canPing() { this.sync(); return this.scope?.role === 'SPECTATOR' && this.scope.canSend && !this.blocked && !this.pending.ping && this.now() - this.last.ping >= 1000 }
  async send(kind: 'chat' | 'ping', value: string | { x: number; y: number }) {
    this.sync()
    const scope = this.scope
    if (!scope?.canSend || this.blocked || (kind === 'ping' && scope.role !== 'SPECTATOR')) return false
    if (this.pending[kind] || this.now() - this.last[kind] < 1000) {
      useOmokEvents.setState(kind === 'chat' ? { error: '잠시 후 다시 보내주세요. (1초 간격)' }
        : { pingError: pingThrottleMessage }); return false
    }
    let extra: Record<string, unknown>
    try {
      if (kind === 'chat') extra = { text: spectatorText(value as string) }
      else {
        const { x, y } = value as { x: number; y: number }
        if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x > 14 || y < 0 || y > 14) return false
        extra = { basedOnVersion: scope.version, x, y }
      }
    } catch (error) { useOmokEvents.setState({ error: (error as Error).message }); return false }
    const eventId = crypto.randomUUID(), requestIds: string[] = []
    this.pending[kind] = true
    useOmokEvents.setState(kind === 'chat' ? { error: '', sending: true } : { pingError: '', pingSending: true })
    try {
      const response = await this.deps.request(kind === 'chat' ? 'GAME_SPECTATOR_CHAT_SEND' : 'OMOK_SPECTATOR_PING_SEND',
        { gameId: scope.gameId, eventId, ...extra }, [kind === 'chat' ? 'GAME_SPECTATOR_CHAT_MESSAGE' : 'OMOK_SPECTATOR_PING'],
        id => { requestIds.push(id); this.requests.add(id) })
      if (this.deps.scope()?.key !== scope.key) return false
      const event = parseSpectatorEvent(response)
      if (!event || event.gameId !== scope.gameId || event.eventId !== eventId) throw new Error('관전 이벤트 승인 응답을 확인해주세요.')
      this.last[kind] = this.now()
      if (event.kind === 'ping') this.pingFeedback = { text: `${omokCoordinate(event.x, event.y)} 추천을 보냈어요.`, until: this.now() + 2500 }
      this.accept(response) // ACK is displayed once; SharedSocket may have delivered it already.
      return true
    } catch (error) {
      if (this.deps.scope()?.key !== scope.key) return false
      const code = record(error) ? error.code : undefined
      if (['GAME_SPECTATOR_ACCESS_DENIED', 'GAME_SPECTATOR_AUTH_REQUIRED', 'GAME_SPECTATOR_NOT_CONFIGURED',
        'GAME_SPECTATOR_UNSUPPORTED_GAME', 'GAME_SPECTATOR_GAME_NOT_PLAYING'].includes(String(code))) this.blocked = true
      const message = code === 'OMOK_SPECTATOR_PING_STALE_VERSION' ? '최신 판이 표시된 뒤 다시 추천해주세요.'
        : error instanceof Error ? error.message : '전송하지 못했어요. 자동으로 다시 보내지 않습니다.'
      useOmokEvents.setState(kind === 'chat' ? { error: message } : { pingError: message }); this.publish(); return false
    } finally {
      requestIds.forEach(id => this.requests.delete(id))
      if (this.scope?.key === scope.key) {
        this.pending[kind] = false
        if (kind === 'chat') useOmokEvents.setState({ sending: false })
        else this.publish()
      }
    }
  }
}
