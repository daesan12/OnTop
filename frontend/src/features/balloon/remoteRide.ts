import { create } from 'zustand'
import { cabinRider, CABIN_WALK_RADIUS, idleCabin, type CabinPose } from './cabin'
import type { Point } from './flight'

const INTERPOLATION_MS = 150
const ownEndListeners = new Set<() => void>()
type RemoteFlight = {
  from: Point; to: Point; aboard: boolean; receivedAt: number
  cabinFrom: CabinPose; cabinTo: CabinPose
}

export const useRemoteBalloons = create<{ flights: Record<string, RemoteFlight> }>(() => ({ flights: {} }))

function progress(flight: RemoteFlight, at: number) {
  return Math.max(0, Math.min(1, (at - flight.receivedAt) / INTERPOLATION_MS))
}

function sample(flight: RemoteFlight, at: number): Point {
  const t = progress(flight, at)
  return {
    x: flight.from.x + (flight.to.x - flight.from.x) * t,
    y: flight.from.y + (flight.to.y - flight.from.y) * t,
    z: flight.from.z + (flight.to.z - flight.from.z) * t,
  }
}

function sampleCabin(flight: RemoteFlight, at: number): CabinPose {
  const { cabinFrom, cabinTo } = flight
  if (cabinTo.seatIndex >= 0 || cabinFrom.seatIndex >= 0) return cabinTo
  const t = progress(flight, at)
  return { ...cabinTo, x: cabinFrom.x + (cabinTo.x - cabinFrom.x) * t,
    z: cabinFrom.z + (cabinTo.z - cabinFrom.z) * t }
}

function parseCabin(value: unknown): CabinPose | null {
  if (value === undefined) return idleCabin
  if (!value || typeof value !== 'object') return null
  const { x, z, yaw, seatIndex, moving } = value as Partial<CabinPose>
  if (typeof x !== 'number' || typeof z !== 'number' || typeof yaw !== 'number' || typeof seatIndex !== 'number'
    || !Number.isFinite(x) || !Number.isFinite(z) || Math.hypot(x, z) > CABIN_WALK_RADIUS
    || !Number.isFinite(yaw) || Math.abs(yaw) > Math.PI || !Number.isInteger(seatIndex) || seatIndex < -1 || seatIndex > 3
    || typeof moving !== 'boolean' || (seatIndex >= 0 && moving)) return null
  return { x, z, yaw, seatIndex, moving }
}

export function sampleRemoteBalloon(pilot: string, at = performance.now()) {
  const flight = useRemoteBalloons.getState().flights[pilot]
  return flight ? sample(flight, at) : null
}

export function remoteBalloonRider(pilot: string, at: number) {
  const flight = useRemoteBalloons.getState().flights[pilot]
  return flight?.aboard ? cabinRider(sample(flight, at), sampleCabin(flight, at)) : null
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
  const cabinTo = parseCabin('cabin' in flight ? flight.cabin : undefined)
  if (!cabinTo) return
  const previous = flights[pilotId]
  const from = previous ? sample(previous, at) : to
  const cabinFrom = previous ? sampleCabin(previous, at) : cabinTo
  useRemoteBalloons.setState({ flights: { ...flights, [pilotId]: { from, to, cabinFrom, cabinTo,
    aboard: flight.aboard, receivedAt: at } } })
}
