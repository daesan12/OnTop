import { create } from 'zustand'
import { estimatedServerTime } from '../../network/worldClient'
import { useGame } from '../store'
import { useHalliStage } from './anchors'
import type { FruitCard, HalliEvent, HalliGalli } from './protocol'

/**
 * Card flights after a bell. Presentation only: the server state is already shown (counts, timer, turn, inputs);
 * a flight draws short-lived copies over it, moving from where the cards were to where they are now. A flight is
 * planned only when the previous state is the version right before the event, so every source, target and count
 * comes from the server and nothing is guessed; otherwise the cards just appear where they are.
 */
export const FLIGHT = {
  /** Bell success: up to `perSeat` cards from each face-up pile slide as a loose stack into the ringer's pile. */
  collect: { total: 560, seatGap: 40, layerGap: 30, perSeat: 3, min: 300 },
  /** Wrong bell: one card to each other active player; an issued card first appears by the bell. */
  penalty: { total: 440, gap: 40, appear: 110 },
  /** A bell older than this (delivered late, or replayed by a reconnect) is not animated. */
  maxAge: 900,
  /** A success flight ends this long before the result pause does. */
  margin: 60,
  slots: 12,
} as const

export type FlightKind = 'collect' | 'penalty' | 'issued'
export interface Flight {
  kind: FlightKind
  /** Pile the card leaves, with its size before the event; an issued card comes from the bell. */
  from: { userId: string; pile: 'face' | 'draw'; count: number } | { userId: string; pile: 'bell' }
  /** Face-down pile the card lands on, with its size after the event. */
  to: { userId: string; count: number }
  /** Top card of a collected pile shows its fruit; cards below it are blank edges; penalty cards show the back. */
  card: FruitCard | null
  /** 0 is the top of a moving stack. */
  layer: number
  /** Cards this flight stands for: a collected pile of 20 moves as 3 cards whose weights add up to 20. */
  weight: number
  delay: number
  duration: number
}
export interface FlightPlan { key: string; type: HalliEvent['type']; total: number; flights: Flight[] }

export const eventKey = (e: HalliEvent | null) => e ? `${e.type}:${e.userId}:${e.at}` : null
const easeOut = (t: number) => 1 - (1 - t) ** 3

/** Plan for the bell that turned `prev` into `next`, or null when it must not be animated. `now` is server time. */
export function planFlights(prev: HalliGalli | null, next: HalliGalli, now: number): FlightPlan | null {
  const e = next.lastEvent, key = eventKey(e)
  if (!e || !key || !prev || next.version !== prev.version + 1 || eventKey(prev.lastEvent) === key) return null
  if (prev.players.length !== next.players.length || prev.players.some((p, i) => p.userId !== next.players[i]!.userId)) return null
  const age = now - Date.parse(e.at)
  if (!(age > -FLIGHT.maxAge && age < FLIGHT.maxAge)) return null
  const ringer = next.players.findIndex(p => p.userId === e.userId)
  if (ringer < 0) return null
  // Seats from the one after the ringer, as the server pays penalties and as the cards are swept.
  const order = next.players.map((_, i) => (ringer + 1 + i) % next.players.length)
  if (e.type === 'RING_SUCCESS') return collect(prev, next, e, key, order, now)
  if (e.type === 'RING_PENALTY') return penalty(prev, next, e, key, order)
  return null
}

function collect(prev: HalliGalli, next: HalliGalli, e: HalliEvent, key: string, order: number[], now: number): FlightPlan | null {
  const { collect: c } = FLIGHT, ringer = next.players.find(p => p.userId === e.userId)!
  const before = prev.players.find(p => p.userId === e.userId)!
  const sources = order.map(i => prev.players[i]!).filter(p => p.faceUpCount > 0)
  if (sources.reduce((sum, p) => sum + p.faceUpCount, 0) !== e.cardCount || next.players.some(p => p.faceUpCount !== 0)
    || ringer.drawCount !== before.drawCount + e.cardCount) return null
  // Finish inside the result pause, whatever part of it the delivery took.
  const budget = next.resultUntil ? Date.parse(next.resultUntil) - now - FLIGHT.margin : c.total
  const total = Math.min(c.total, budget)
  if (total < c.min) return null
  const stretch = total / c.total, lastDelay = ((sources.length - 1) * c.seatGap + (c.perSeat - 1) * c.layerGap) * stretch
  const flights: Flight[] = []
  sources.forEach((p, seat) => {
    const shown = Math.min(c.perSeat, p.faceUpCount)
    for (let layer = 0; layer < shown; layer++) flights.push({
      kind: 'collect', from: { userId: p.userId, pile: 'face', count: p.faceUpCount }, to: { userId: ringer.userId, count: ringer.drawCount },
      card: layer === 0 ? p.topCard : null, layer, weight: layer === 0 ? p.faceUpCount - shown + 1 : 1,
      delay: (seat * c.seatGap + layer * c.layerGap) * stretch, duration: total - lastDelay,
    })
  })
  return flights.length ? { key, type: e.type, total, flights: flights.slice(0, FLIGHT.slots) } : null
}

function penalty(prev: HalliGalli, next: HalliGalli, e: HalliEvent, key: string, order: number[]): FlightPlan | null {
  const { penalty: c } = FLIGHT, ringer = next.players.find(p => p.userId === e.userId)!
  const before = prev.players.find(p => p.userId === e.userId)!
  const recipients = order.map(i => next.players[i]!).filter(p => p.userId !== e.userId && !p.eliminated)
  const paid = e.cardCount - e.issuedCards
  if (recipients.length !== e.cardCount || paid < 0 || before.drawCount - ringer.drawCount !== paid
    || (e.issuedCards > 0 && (!ringer.eliminated || ringer.drawCount !== 0))
    || recipients.some(p => p.drawCount - prev.players.find(old => old.userId === p.userId)!.drawCount !== 1)) return null
  const duration = c.total - (recipients.length - 1) * c.gap
  return { key, type: e.type, total: c.total, flights: recipients.map((p, i) => ({
    kind: i < paid ? 'penalty' : 'issued',
    from: i < paid ? { userId: ringer.userId, pile: 'draw', count: before.drawCount - i } : { userId: ringer.userId, pile: 'bell' },
    to: { userId: p.userId, count: p.drawCount }, card: null, layer: 0, weight: 1, delay: i * c.gap, duration,
  })) }
}

/**
 * Where one flight is at `elapsed` ms, or null while it is not drawn: a penalty card is still part of its pile until
 * it leaves, and every card is part of its target pile once it lands. A collected stack waits on its face-up pile
 * until it leaves, because the server state already shows that pile empty. `appear` (0..1) is an issued card fading
 * in by the bell before it moves; `t` (0..1, eased) is how far along the path it is.
 */
export function flightPhase(f: Flight, elapsed: number): { appear: number; t: number } | null {
  const raw = (elapsed - f.delay) / f.duration
  if (raw >= 1) return null
  if (raw < 0) return f.kind === 'collect' ? { appear: 1, t: 0 } : null
  const share = f.kind === 'issued' ? Math.min(.45, FLIGHT.penalty.appear / f.duration) : 0
  return raw < share ? { appear: raw / share, t: 0 } : { appear: 1, t: easeOut((raw - share) / (1 - share)) }
}

/**
 * How far the drawn 3D stacks are from the server counts while cards are in the air: a pile keeps what has not left
 * yet and does not have what has not landed yet. Zero once the plan is over.
 */
export function pileOffset(plan: FlightPlan | null, elapsed: number, userId: string) {
  const offset = { draw: 0, face: 0 }
  if (!plan || elapsed >= plan.total) return offset
  for (const f of plan.flights) {
    const raw = (elapsed - f.delay) / f.duration
    if (raw < 1 && f.to.userId === userId) offset.draw -= f.weight
    if (raw < 0 && f.from.userId === userId && f.from.pile === 'face') offset.face += f.weight
    if (raw < 0 && f.from.userId === userId && f.from.pile === 'draw') offset.draw += f.weight
  }
  return offset
}

/** The running flights; `startedAt` is performance.now() when they began. */
export const useHalliFlights = create<{ gameId: string | null; plan: FlightPlan | null; startedAt: number }>(() =>
  ({ gameId: null, plan: null, startedAt: 0 }))
export const flightElapsed = () => performance.now() - useHalliFlights.getState().startedAt
const clear = () => { if (useHalliFlights.getState().plan) useHalliFlights.setState({ plan: null }) }
const quiet = () => typeof document !== 'undefined' && document.hidden
  || typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Last bell seen per game, so a repeated, restored or remounted state never plays the same bell twice. */
const seen = new Map<string, string>()
let installs = 0, stop: (() => void) | null = null, timer: ReturnType<typeof setTimeout> | undefined
/**
 * Watches the game store for bells, for players and spectators alike. Reference counted: every mounted table layout
 * installs it, one subscription runs.
 */
export function installHalliFlights() {
  if (installs++ === 0) {
    const game = useGame.subscribe((s, before) => {
      const g = s.game, p = before.game
      if (!g?.halli) { if (useHalliFlights.getState().gameId !== null) useHalliFlights.setState({ gameId: null, plan: null }); return }
      if (g === p) return
      if (useHalliFlights.getState().gameId !== g.gameId) useHalliFlights.setState({ gameId: g.gameId, plan: null })
      const key = eventKey(g.halli.lastEvent)
      if (!key || seen.get(g.gameId) === key) return
      seen.set(g.gameId, key)
      if (g.halli.lastEvent!.type !== 'RING_SUCCESS' && g.halli.lastEvent!.type !== 'RING_PENALTY') return
      // A newer bell always replaces the running flights, animated or not, so stale copies never linger.
      const plan = p?.gameId === g.gameId && p.halli && !quiet() ? planFlights(p.halli, g.halli, estimatedServerTime()) : null
      useHalliFlights.setState({ plan, startedAt: performance.now() })
      clearTimeout(timer)
      if (plan) timer = setTimeout(() => { if (useHalliFlights.getState().plan === plan) clear() }, plan.total + 80)
    })
    // The flights belong to one layout; switching between the table stage and the fixed table ends them.
    const stage = useHalliStage.subscribe((s, before) => { if (s.projected !== before.projected) clear() })
    stop = () => { game(); stage(); clearTimeout(timer) }
  }
  return () => {
    if (--installs > 0) return
    stop?.(); stop = null; clear()
  }
}
