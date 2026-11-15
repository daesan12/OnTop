import { create } from 'zustand'
import { authoritativePose, useSession } from '../../network/worldClient'
import { refreshWalletAfterSettlement } from '../wallet/settlementRefresh'
import { BALLOON_RIDE_ENABLED } from '../../park/mapSelection'
import { parkRuntime } from '../../park/runtime/runtime'
import { clearRoamingInput, inputState } from '../../world/inputOwnership'
import { BalloonFareError, buyBalloonTicket, completeBalloonTicket } from './fare'
import { createFlight, REMOVE_SECONDS, returnToDock, stepFlight, takeOff } from './flight'
import type { Flight, FlightMap, Input, Point } from './flight'
import { clearRemoteBalloons, watchOwnBalloonEnd } from './remoteRide'
import { cabinRider, idleCabin, toggleCabinSeat, walkCabin, type BalloonRiderPose, type CabinPose } from './cabin'

type LocalRide = {
  owner: string
  room: string
  panel: 'closed' | 'loading' | 'board' | 'paying' | 'error'
  map: FlightMap | null
  flight: Flight | null
  cabin: CabinPose
  walkingInside: boolean
  ticketId: string
  paymentError: string
  revealSeconds: number
}

const DOCK_STEP_SECONDS = .5
const FIELD_RETURN_FADE_SECONDS = .25
const POSE_INTERVAL_MS = 125
let lastPoseAt = 0
const idle: LocalRide = {
  owner: '', room: '', panel: 'closed', map: null, flight: null, ticketId: '', paymentError: '', revealSeconds: 0,
  cabin: idleCabin, walkingInside: false,
}
export const useLocalBalloon = create<LocalRide>(() => idle)

function ownsRide(ride: LocalRide) {
  const session = useSession.getState()
  return session.sessionId === ride.owner && session.roomId === ride.room
    && session.status === 'connected' && session.mapCompatible
}

export function openLocalBalloon() {
  if (!BALLOON_RIDE_ENABLED || inputState.localBalloon) return false
  const { sessionId, roomId, status, mapCompatible } = useSession.getState()
  if (!sessionId || !roomId || status !== 'connected' || !mapCompatible) return false
  inputState.localBalloon = true
  clearRoamingInput()
  useLocalBalloon.setState({ owner: sessionId, room: roomId, panel: 'loading' })
  const request = useLocalBalloon.getState()
  void import('./previewMap').then(({ flightMap }) => {
    if (useLocalBalloon.getState() === request && ownsRide(request)) useLocalBalloon.setState({ map: flightMap, panel: 'board' })
  }).catch(() => {
    if (useLocalBalloon.getState() === request) useLocalBalloon.setState({ panel: 'error' })
  })
  return true
}

export function cancelLocalBalloon() {
  const { ticketId } = useLocalBalloon.getState()
  if (ticketId) parkRuntime.endBalloon(ticketId)
  useLocalBalloon.setState(idle)
  inputState.localBalloon = false
  clearRoamingInput()
}

export async function boardLocalBalloon() {
  const ride = useLocalBalloon.getState()
  if (ride.panel !== 'board' || !ride.map || !ownsRide(ride)) return
  useLocalBalloon.setState({ panel: 'paying', paymentError: '' })
  const payment = useLocalBalloon.getState()
  const stillWaiting = () => useLocalBalloon.getState() === payment && ownsRide(payment)
  let ticket = ''
  try {
    ticket = await buyBalloonTicket(ride.owner)
    if (!stillWaiting()) return
    refreshWalletAfterSettlement(ride.owner, 'balloon:' + ticket)
    await parkRuntime.startBalloon(ticket, ride.map.dock)
    if (!stillWaiting()) {
      parkRuntime.endBalloon(ticket)
      return
    }
    completeBalloonTicket(ride.owner, ticket)
    clearRoamingInput()
    lastPoseAt = performance.now()
    useLocalBalloon.setState({ panel: 'closed', ticketId: ticket, flight: takeOff(createFlight(ride.map)) })
  } catch (error) {
    if (!stillWaiting()) return
    const expired = ticket && typeof error === 'object' && error !== null && 'code' in error
      && error.code === 'BALLOON_TICKET_EXPIRED'
    if (expired) completeBalloonTicket(ride.owner, ticket)
    useLocalBalloon.setState({ panel: 'board', paymentError: error instanceof BalloonFareError ? error.message
      : expired ? '이전 탑승권의 유효 시간이 끝났어요. 다시 결제해 주세요.' : '탑승을 시작하지 못했어요. 다시 시도해 주세요.' })
  }
}

export function returnLocalBalloon() {
  const ride = useLocalBalloon.getState()
  if (!ride.flight) return
  useLocalBalloon.setState({ flight: returnToDock(ride.flight, 'manual') })
}

export function toggleLocalCabinMode() {
  const ride = useLocalBalloon.getState()
  if (ride.flight?.phase !== 'flying') return
  clearRoamingInput()
  useLocalBalloon.setState({ walkingInside: !ride.walkingInside, cabin: ride.walkingInside ? idleCabin : ride.cabin })
}

export function toggleLocalCabinSeat() {
  const ride = useLocalBalloon.getState()
  if (ride.flight?.phase !== 'flying' || !ride.walkingInside) return
  clearRoamingInput()
  useLocalBalloon.setState({ cabin: toggleCabinSeat(ride.cabin) })
}

const neutralFlight: Input = { x: 0, z: 0, lift: 0 }

export function tickLocalBalloon(input: Input, elapsed: number) {
  const ride = useLocalBalloon.getState()
  if (!ride.owner || !ownsRide(ride)) return
  if (ride.revealSeconds > 0) {
    const revealSeconds = Math.max(0, ride.revealSeconds - Math.min(.1, elapsed))
    if (revealSeconds === 0) cancelLocalBalloon()
    else useLocalBalloon.setState({ revealSeconds })
    return
  }
  if (!ride.flight || !ride.map) return
  const walking = ride.flight.phase === 'flying' && ride.walkingInside
  const cabin = walking ? walkCabin(ride.cabin, input, elapsed)
    : ride.cabin.moving ? { ...ride.cabin, moving: false } : ride.cabin
  const flight = stepFlight(ride.flight, ride.walkingInside ? neutralFlight : input, Math.min(.1, elapsed), ride.map, elapsed)
  const now = performance.now()
  if (ride.ticketId && flight.phase !== 'removed' && now - lastPoseAt >= POSE_INTERVAL_MS) {
    lastPoseAt = now
    parkRuntime.sendBalloonPose(ride.ticketId, flight.position, flight.phase !== 'landed', cabin)
  }
  if (flight.phase === 'removed' && flight.landing === 'field') {
    if (ride.ticketId) parkRuntime.endBalloon(ride.ticketId)
    useLocalBalloon.setState({ flight: null, ticketId: '', revealSeconds: FIELD_RETURN_FADE_SECONDS })
  } else if (flight.phase === 'removed') cancelLocalBalloon()
  else useLocalBalloon.setState({ flight, cabin })
}

export function localBalloonFade(ride: LocalRide) {
  if (ride.revealSeconds > 0) return ride.revealSeconds / FIELD_RETURN_FADE_SECONDS
  const { flight } = ride
  if (flight?.phase !== 'landed' || flight.landing !== 'field') return 0
  return Math.max(0, 1 - flight.seconds / FIELD_RETURN_FADE_SECONDS)
}

export function localBalloonRider(id: string): BalloonRiderPose | null {
  if (!BALLOON_RIDE_ENABLED) return null
  const { owner, flight, cabin } = useLocalBalloon.getState()
  if (!flight || owner !== id) return null
  if (flight.phase !== 'landed') return cabinRider(flight.position, cabin)
  const basket = cabinRider(flight.position, { ...cabin, seatIndex: -1, moving: false })
  const atExit = (exit: Point | undefined) => exit ? { ...basket, ...exit } : null
  if (flight.landing === 'field') return atExit(flight.exit)

  // The server keeps the player on the ground during this local experience.
  const pose = authoritativePose(id)
  if (!pose) return atExit(flight.exit)
  const step = Math.min(1, (REMOVE_SECONDS - flight.seconds) / DOCK_STEP_SECONDS)
  const progress = step * step * (3 - 2 * step)
  return {
    ...basket,
    x: basket.x + (pose.x - basket.x) * progress,
    y: basket.y + (pose.y - .8 - basket.y) * progress,
    z: basket.z + (pose.z - basket.z) * progress,
  }
}

export function watchLocalBalloonSession() {
  const unwatch = useSession.subscribe((session, previous) => {
    if (session.sessionId === previous.sessionId && session.roomId === previous.roomId
      && session.status === previous.status && session.mapCompatible === previous.mapCompatible) return
    clearRemoteBalloons()
    if (inputState.localBalloon && !ownsRide(useLocalBalloon.getState())) cancelLocalBalloon()
  })
  const unwatchEnd = watchOwnBalloonEnd(() => {
    if (!useLocalBalloon.getState().ticketId) return
    useLocalBalloon.setState({ ticketId: '' })
    cancelLocalBalloon()
  })
  return () => { unwatch(); unwatchEnd(); clearRemoteBalloons() }
}
