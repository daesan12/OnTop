import { create } from 'zustand'
import { authoritativePose, useSession } from '../../network/worldClient'
import { refreshWalletAfterSettlement } from '../wallet/settlementRefresh'
import { BALLOON_RIDE_ENABLED } from '../../park/mapSelection'
import { parkRuntime } from '../../park/runtime/runtime'
import { clearRoamingInput, inputState } from '../../world/inputOwnership'
import { BalloonFareError, buyBalloonTicket, completeBalloonTicket } from './fare'
import { createFlight, REMOVE_SECONDS, returnToDock, stepFlight, takeOff } from './flight'
import type { BalloonBoarding, Flight, FlightMap, Input, Point } from './flight'
import { clearRemoteBalloons, sampleRemoteBalloon, useRemoteBalloons, watchOwnBalloonEnd } from './remoteRide'
import { cabinRider, idleCabin, toggleCabinSeat, walkCabin, type BalloonRiderPose, type CabinPose } from './cabin'
import { resetCabinCamera } from './cabinCamera'

type LocalRide = {
  owner: string
  room: string
  panel: 'closed' | 'loading' | 'board' | 'manual' | 'paying' | 'error'
  map: FlightMap | null
  flight: Flight | null
  cabin: CabinPose
  walkingInside: boolean
  cabinFirstPerson: boolean
  leader: string
  launching: boolean
  ticketId: string
  paymentError: string
  revealSeconds: number
}

const DOCK_STEP_SECONDS = .5
const FIELD_RETURN_FADE_SECONDS = .25
const POSE_INTERVAL_MS = 125
let lastPoseAt = 0
let lastGuestPose: CabinPose | null = null
const idle: LocalRide = {
  owner: '', room: '', panel: 'closed', map: null, flight: null, ticketId: '', paymentError: '', revealSeconds: 0,
  cabin: idleCabin, walkingInside: false, cabinFirstPerson: false, leader: '', launching: false,
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

export function showLocalBalloonManual(open: boolean) {
  if (useLocalBalloon.getState().panel === (open ? 'board' : 'manual')) {
    useLocalBalloon.setState({ panel: open ? 'manual' : 'board' })
  }
}

export async function boardLocalBalloon(boarding: BalloonBoarding) {
  const ride = useLocalBalloon.getState()
  if (ride.panel !== 'board' || !ride.map || !ownsRide(ride)) return
  const guest = 'leaderId' in boarding
  const leader = guest ? boarding.leaderId : ride.owner
  useLocalBalloon.setState({ panel: 'paying', paymentError: '' })
  const payment = useLocalBalloon.getState()
  const stillWaiting = () => useLocalBalloon.getState() === payment && ownsRide(payment)
  let ticket = ''
  try {
    ticket = await buyBalloonTicket(ride.owner, guest ? leader : undefined)
    if (!stillWaiting()) return
    refreshWalletAfterSettlement(ride.owner, 'balloon:' + ticket)
    const sharedFlight = await parkRuntime.startBalloon(ticket, ride.map.dock, boarding)
    if (!stillWaiting()) {
      parkRuntime.endBalloon(ticket)
      return
    }
    if (!sharedFlight) completeBalloonTicket(ride.owner, ticket)
    clearRoamingInput()
    resetCabinCamera()
    lastGuestPose = null
    lastPoseAt = performance.now()
    const flight = createFlight(ride.map)
    useLocalBalloon.setState({ panel: 'closed', ticketId: ticket, leader, walkingInside: guest,
      cabin: useRemoteBalloons.getState().flights[leader]?.party?.passengers[ride.owner] ?? idleCabin,
      flight: sharedFlight ? flight : takeOff(flight) })
  } catch (error) {
    if (!stillWaiting()) return
    const expired = ticket && typeof error === 'object' && error !== null && 'code' in error
      && error.code === 'BALLOON_TICKET_EXPIRED'
    if (expired) completeBalloonTicket(ride.owner, ticket)
    useLocalBalloon.setState({ panel: 'board', paymentError: error instanceof BalloonFareError ? error.message
      : expired ? '이전 탑승권의 유효 시간이 끝났어요. 다시 결제해 주세요.' : '탑승을 시작하지 못했어요. 다시 시도해 주세요.' })
  }
}

export async function launchLocalBalloon() {
  const { owner, leader, ticketId, flight, launching } = useLocalBalloon.getState()
  if (!ticketId || owner !== leader || flight?.phase !== 'boarding' || launching) return
  useLocalBalloon.setState({ launching: true, paymentError: '' })
  try {
    await parkRuntime.launchBalloon(ticketId)
  } catch (error) {
    if (useLocalBalloon.getState().ticketId === ticketId) {
      const blocked = typeof error === 'object' && error !== null && 'code' in error && error.code === 'BALLOON_LAUNCH_REJECTED'
      useLocalBalloon.setState({ paymentError: blocked ? '다른 손님이 결제 중이에요. 잠시 후 다시 출발해 주세요.'
        : '출발을 확인하지 못했어요. 다시 시도해 주세요.' })
    }
  } finally {
    if (useLocalBalloon.getState().ticketId === ticketId) useLocalBalloon.setState({ launching: false })
  }
}

export function returnLocalBalloon() {
  const ride = useLocalBalloon.getState()
  if (!ride.flight || ride.owner !== ride.leader) return
  useLocalBalloon.setState({ flight: returnToDock(ride.flight, 'manual') })
}

export function toggleLocalCabinMode() {
  const ride = useLocalBalloon.getState()
  if (ride.flight?.phase !== 'flying' || ride.owner !== ride.leader) return
  clearRoamingInput()
  useLocalBalloon.setState({ walkingInside: !ride.walkingInside, cabinFirstPerson: false,
    cabin: ride.walkingInside ? idleCabin : ride.cabin })
}

export function occupiedBalloonSeats(ride: LocalRide) {
  if (!ride.leader) return []
  const group = useRemoteBalloons.getState().flights[ride.leader]
  if (!group?.party) return []
  const occupied = Object.entries(group.party.passengers).filter(([id]) => id !== ride.owner).map(([, pose]) => pose.seatIndex)
  if (ride.leader !== ride.owner) occupied.push(group.cabinTo.seatIndex)
  return occupied
}

export function toggleLocalCabinSeat() {
  const ride = useLocalBalloon.getState()
  if (ride.flight?.phase !== 'flying' || !ride.walkingInside) return
  clearRoamingInput()
  useLocalBalloon.setState({ cabin: toggleCabinSeat(ride.cabin, occupiedBalloonSeats(ride)) })
}

export function toggleLocalCabinPerspective() {
  const ride = useLocalBalloon.getState()
  if (!ride.walkingInside || ride.flight?.phase !== 'flying') return
  useLocalBalloon.setState({ cabinFirstPerson: !ride.cabinFirstPerson })
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
  const guest = ride.leader !== ride.owner
  const shared = useRemoteBalloons.getState().flights[ride.leader]
  let flight = ride.flight
  if (flight.phase === 'boarding' && shared?.party && !shared.party.boarding) {
    completeBalloonTicket(ride.owner, ride.ticketId)
    flight = takeOff(flight)
    if (guest) flight = { ...flight, phase: 'flying' }
  }
  if (guest) {
    const position = sampleRemoteBalloon(ride.leader)
    if (!shared?.aboard || !shared.party?.passengers[ride.owner] || !position) {
      if (!shared?.party?.passengers[ride.owner]) useLocalBalloon.setState({ ticketId: '' })
      cancelLocalBalloon()
      return
    }
    flight = { ...flight, position }
  } else {
    flight = stepFlight(flight, ride.walkingInside ? neutralFlight : input, Math.min(.1, elapsed), ride.map, elapsed)
  }
  const walking = flight.phase === 'flying' && ride.walkingInside
  const pose = ride.cabin.seatIndex >= 0 && occupiedBalloonSeats(ride).includes(ride.cabin.seatIndex)
    ? toggleCabinSeat(ride.cabin) : ride.cabin
  const cabin = walking ? walkCabin(pose, input, elapsed) : pose.moving ? { ...pose, moving: false } : pose
  const now = performance.now()
  const guestMoved = guest && walking && (!lastGuestPose || cabin.x !== lastGuestPose.x
    || cabin.z !== lastGuestPose.z || cabin.seatIndex !== lastGuestPose.seatIndex || cabin.moving !== lastGuestPose.moving)
  if (ride.ticketId && flight.phase !== 'removed' && (!guest || guestMoved) && now - lastPoseAt >= POSE_INTERVAL_MS) {
    lastPoseAt = now
    if (guest) lastGuestPose = cabin
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
