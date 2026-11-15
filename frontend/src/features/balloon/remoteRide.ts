import { create } from 'zustand'
import { BALLOON_SCALE } from '../../../park-renewal-preview/plan'
import type { Point } from './flight'

const INTERPOLATION_MS = 150
const ownEndListeners = new Set<() => void>()
type RemoteFlight = { from: Point; to: Point; aboard: boolean; receivedAt: number }

export const useRemoteBalloons = create<{ flights: Record<string, RemoteFlight> }>(() => ({ flights: {} }))

function sample(flight: RemoteFlight, at: number): Point {
  const t = Math.max(0, Math.min(1, (at - flight.receivedAt) / INTERPOLATION_MS))
  return {
    x: flight.from.x + (flight.to.x - flight.from.x) * t,
    y: flight.from.y + (flight.to.y - flight.from.y) * t,
    z: flight.from.z + (flight.to.z - flight.from.z) * t,
  }
}

export function sampleRemoteBalloon(pilot: string, at = performance.now()) {
  const flight = useRemoteBalloons.getState().flights[pilot]
  return flight ? sample(flight, at) : null
}

export function remoteBalloonRider(pilot: string, at: number) {
  if (!useRemoteBalloons.getState().flights[pilot]?.aboard) return null
  const position = sampleRemoteBalloon(pilot, at)
  return position && { ...position, y: position.y + .425 * BALLOON_SCALE }
}

export function clearRemoteBalloons() {
  if (Object.keys(useRemoteBalloons.getState().flights).length) useRemoteBalloons.setState({ flights: {} })
}

export function watchOwnBalloonEnd(listener: () => void) {
  ownEndListeners.add(listener)
  return () => { ownEndListeners.delete(listener) }
}

export function notifyOwnBalloonEnd() {
  ownEndListeners.forEach(listener => listener())
}

export function receiveRemoteBalloon(payload: Record<string, unknown>, channel: string, user: string, at = performance.now()) {
  const { channelId, pilotId, flight } = payload
  if (!channel || channelId !== channel || typeof pilotId !== 'string'
    || !/^[1-9]\d{0,18}$/.test(pilotId) || pilotId === user) return
  const flights = useRemoteBalloons.getState().flights
  if (flight === null) {
    if (!flights[pilotId]) return
    const next = { ...flights }
    delete next[pilotId]
    useRemoteBalloons.setState({ flights: next })
    return
  }
  if (!flight || typeof flight !== 'object' || !('aboard' in flight) || typeof flight.aboard !== 'boolean'
    || !('position' in flight) || !flight.position || typeof flight.position !== 'object') return
  const { x, y, z } = flight.position as Partial<Point>
  if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number'
    || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return
  const to = { x, y, z }
  const previous = flights[pilotId]
  const from = previous ? sample(previous, at) : to
  useRemoteBalloons.setState({ flights: { ...flights, [pilotId]: { from, to, aboard: flight.aboard, receivedAt: at } } })
}
