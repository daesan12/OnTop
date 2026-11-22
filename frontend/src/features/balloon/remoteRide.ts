import { create } from 'zustand'
import { cabinRider, CABIN_WALK_RADIUS, idleCabin, type CabinPose } from './cabin'
import { CAPACITY, type Input, type Point } from './flight'
import { stoppedFlightInput, type BalloonControls } from './controls'

const INTERPOLATION_MS = 150
const WARNING_MOTION_STALE_MS = 600
const ownEndListeners = new Set<() => void>()
type RemoteFlight = {
  from: Point; to: Point; aboard: boolean; receivedAt: number
  cabinFrom: CabinPose; cabinTo: CabinPose
  party: BalloonParty | null
  passengersFrom: Record<string, CabinPose>
  warningInput: Input
}
export type BalloonParty = { capacity: number; boarding: boolean; passengers: Record<string, CabinPose>; controls: BalloonControls | null }
const userId = /^[1-9]\d{0,18}$/

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

function interpolateCabin(cabinFrom: CabinPose, cabinTo: CabinPose, t: number): CabinPose {
  if (cabinTo.seatIndex >= 0 || cabinFrom.seatIndex >= 0) return cabinTo
  return { ...cabinTo, x: cabinFrom.x + (cabinTo.x - cabinFrom.x) * t,
    z: cabinFrom.z + (cabinTo.z - cabinFrom.z) * t }
}

function sampleCabin(flight: RemoteFlight, at: number): CabinPose {
  return interpolateCabin(flight.cabinFrom, flight.cabinTo, progress(flight, at))
}

function samplePassenger(flight: RemoteFlight, id: string, cabin: CabinPose, at: number) {
  return interpolateCabin(flight.passengersFrom[id] ?? cabin, cabin, progress(flight, at))
}

function parseParty(value: unknown): BalloonParty | null {
  if (!value || typeof value !== 'object') return null
  const { capacity, boarding, passengers, controls } = value as Partial<BalloonParty>
  if (typeof capacity !== 'number' || !Number.isInteger(capacity) || capacity < 1 || capacity > CAPACITY
    || typeof boarding !== 'boolean' || !passengers || typeof passengers !== 'object') return null
  if (controls && (controls.mode !== 'solo' && controls.mode !== 'split'
    || !controls.input || ![controls.input.x, controls.input.z, controls.input.lift].every(axis => Number.isFinite(axis) && Math.abs(axis) <= 1))) return null
  const riders: Record<string, CabinPose> = {}
  for (const [id, pose] of Object.entries(passengers)) {
    const parsed = parseCabin(pose)
    if (!userId.test(id) || !parsed) return null
    riders[id] = parsed
  }
  if (Object.keys(riders).length >= capacity) return null
  return { capacity, boarding, passengers: riders, controls: controls ?? null }
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

/** 렌더 보간이 끝난 프레임에도 마지막 패킷 간 속도를 유지하되 오래된 이동은 예측하지 않는다. */
export function sampleRemoteBalloonWarningInput(pilot: string, at = performance.now()): Input {
  const flight = useRemoteBalloons.getState().flights[pilot]
  if (!flight?.aboard || at < flight.receivedAt || at - flight.receivedAt > WARNING_MOTION_STALE_MS) {
    return stoppedFlightInput
  }
  return flight.warningInput
}

export function remoteBalloonRider(id: string, at: number, localPilot?: { id: string; position: Point }) {
  const { flights } = useRemoteBalloons.getState()
  const flight = flights[id]
  if (flight?.aboard) return cabinRider(sample(flight, at), sampleCabin(flight, at))
  for (const leader in flights) {
    const group = flights[leader]!
    const cabin = group.party?.passengers[id]
    if (cabin && group.aboard) return cabinRider(localPilot?.id === leader ? localPilot.position : sample(group, at),
      samplePassenger(group, id, cabin, at))
  }
  return null
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
  const { channelId, pilotId, flight, party: partyPayload } = payload
  if (!channel || channelId !== channel || typeof pilotId !== 'string'
    || !userId.test(pilotId)) return
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
  const party = parseParty(partyPayload)
  if ((partyPayload != null && !party) || (pilotId === user && !party)) return
  const previous = flights[pilotId]
  const elapsed = previous ? (at - previous.receivedAt) / 1000 : 0
  // 표시용 from은 150ms 보간 중인 위치다. 속도는 실제로 수신한 두 to와 수신 간격으로 구한다.
  const warningInput = previous?.aboard && flight.aboard && elapsed > 0 && elapsed <= 1 ? {
    x: Math.max(-1, Math.min(1, (to.x - previous.to.x) / (10 * elapsed))),
    z: Math.max(-1, Math.min(1, (to.z - previous.to.z) / (10 * elapsed))),
    lift: Math.max(-1, Math.min(1, (to.y - previous.to.y) / (4 * elapsed))),
  } : stoppedFlightInput
  const from = previous ? sample(previous, at) : to
  const cabinFrom = previous ? sampleCabin(previous, at) : cabinTo
  const passengersFrom: Record<string, CabinPose> = {}
  if (party && previous?.party) {
    for (const id of Object.keys(party.passengers)) {
      const old = previous.party.passengers[id]
      if (old) passengersFrom[id] = samplePassenger(previous, id, old, at)
    }
  }
  useRemoteBalloons.setState({ flights: { ...flights, [pilotId]: { from, to, cabinFrom, cabinTo,
    aboard: flight.aboard, receivedAt: at, party, passengersFrom, warningInput } } })
}
