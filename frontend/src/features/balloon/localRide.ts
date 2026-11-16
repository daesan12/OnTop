import { create } from 'zustand'
import { authoritativePose, useSession } from '../../network/worldClient'
import { refreshWalletAfterSettlement } from '../wallet/settlementRefresh'
import { BALLOON_RIDE_ENABLED } from '../../park/mapSelection'
import { parkRuntime } from '../../park/runtime/runtime'
import { clearRoamingInput, inputState } from '../../world/inputOwnership'
import { BalloonFareError, buyBalloonTicket, completeBalloonTicket } from './fare'
import { createFlight, REMOVE_SECONDS, returnToDock, stepFlight, stepUncrewedFlight, takeOff } from './flight'
import type { BalloonBoarding, Flight, FlightMap, Input, Point } from './flight'
import { clearRemoteBalloons, sampleRemoteBalloon, useRemoteBalloons, watchOwnBalloonEnd } from './remoteRide'
import { cabinRider, cabinSeats, idleCabin, toggleCabinSeat, walkCabin, type BalloonRiderPose, type CabinPose } from './cabin'
import { resetCabinCamera } from './cabinCamera'
import { combineFlightInput, inputForRole, roleOf, stoppedFlightInput, type ControlAction, type ControlRole } from './controls'

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
  controlRole: ControlRole | null
  controlPending: boolean
  emptySeconds: number | null
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
  controlRole: null, controlPending: false, emptySeconds: null,
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
    const party = useRemoteBalloons.getState().flights[leader]?.party
    const role = roleOf(party?.controls, ride.owner)
    useLocalBalloon.setState({ panel: 'closed', ticketId: ticket, leader, controlRole: role, walkingInside: !role && guest,
      cabin: role ? cockpitPose(role) : party?.passengers[ride.owner] ?? idleCabin,
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

export async function launchLocalBalloon(solo = false) {
  const { owner, leader, ticketId, flight, launching } = useLocalBalloon.getState()
  if (!ticketId || owner !== leader || flight?.phase !== 'boarding' || launching) return
  useLocalBalloon.setState({ launching: true, paymentError: '' })
  try {
    await parkRuntime.launchBalloon(ticketId, solo)
  } catch (error) {
    if (useLocalBalloon.getState().ticketId === ticketId) {
      const blocked = typeof error === 'object' && error !== null && 'code' in error && error.code === 'BALLOON_LAUNCH_REJECTED'
      useLocalBalloon.setState({ paymentError: blocked ? '탑승 인원과 조종석을 확인해 주세요. 결제 중인 손님이 있다면 잠시 기다려 주세요.'
        : '출발을 확인하지 못했어요. 다시 시도해 주세요.' })
    }
  } finally {
    if (useLocalBalloon.getState().ticketId === ticketId) useLocalBalloon.setState({ launching: false })
  }
}

export function returnLocalBalloon() {
  const ride = useLocalBalloon.getState()
  if (useRemoteBalloons.getState().flights[ride.leader]?.party?.controls) {
    if (ride.controlRole) void changeLocalBalloonControl({ action: 'return', role: ride.controlRole })
    return
  }
  if (!ride.flight || ride.owner !== ride.leader) return
  useLocalBalloon.setState({ flight: returnToDock(ride.flight, 'manual') })
}

export async function changeLocalBalloonControl(action: ControlAction) {
  const ride = useLocalBalloon.getState()
  if (ride.flight?.phase !== 'flying' || !ride.ticketId || ride.controlPending) return
  useLocalBalloon.setState({ controlPending: true, paymentError: '' })
  try {
    await parkRuntime.controlBalloon(ride.ticketId, action)
  } catch {
    if (useLocalBalloon.getState().ticketId === ride.ticketId) {
      useLocalBalloon.setState({ paymentError: '조종석 상태를 확인하고 다시 시도해 주세요.' })
    }
  } finally {
    if (useLocalBalloon.getState().ticketId === ride.ticketId) useLocalBalloon.setState({ controlPending: false })
  }
}

export function toggleLocalCabinMode() {
  const ride = useLocalBalloon.getState()
  if (ride.flight?.phase !== 'flying') return
  const controls = useRemoteBalloons.getState().flights[ride.leader]?.party?.controls
  if (controls) {
    const role = roleOf(controls, ride.owner)
    if (role) void changeLocalBalloonControl({ action: 'leave', role })
    else if (!controls.direction) void changeLocalBalloonControl({ action: 'claim', role: 'direction' })
    else if (controls.mode === 'split' && !controls.altitude) void changeLocalBalloonControl({ action: 'claim', role: 'altitude' })
    return
  }
  if (ride.owner !== ride.leader) return
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
  if (group.party.controls) {
    occupied.push(0)
    if (group.party.controls.mode === 'split') occupied.push(2)
  }
  return occupied
}

export function interactLocalBalloonCabin() {
  const ride = useLocalBalloon.getState()
  const offer = useRemoteBalloons.getState().flights[ride.leader]?.party?.controls?.offer
  if (offer?.to === ride.owner) void changeLocalBalloonControl({ action: 'accept', role: offer.role, offerId: offer.id })
  else toggleLocalCabinSeat()
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

function cockpitPose(role: ControlRole): CabinPose {
  const seatIndex = role === 'direction' ? 0 : 2
  return { ...cabinSeats[seatIndex], seatIndex, moving: false }
}

export function tickLocalBalloon(input: Input, elapsed: number, cabinInput = input) {
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
  const controls = shared?.party?.controls
  const role = roleOf(controls, ride.owner)
  const roleChanged = !!controls && role !== ride.controlRole
  const walkingInside = controls ? !role : ride.walkingInside
  const localInput = walkingInside || roleChanged ? stoppedFlightInput : controls ? inputForRole(controls.mode, role, input) : input
  const flightInput = controls ? combineFlightInput(controls, ride.owner, localInput) : localInput
  const now = performance.now()
  const emptySeconds = controls?.emptyMillis == null || !shared ? null
    : Math.max(0, Math.ceil((controls.emptyMillis - (now - shared.receivedAt)) / 1000))
  if (roleChanged) clearRoamingInput()
  let flight = ride.flight
  if (flight.phase === 'boarding' && shared?.party && !shared.party.boarding) {
    completeBalloonTicket(ride.owner, ride.ticketId)
    flight = takeOff(flight)
    if (guest) flight = { ...flight, phase: 'flying' }
  }
  if (controls?.returning) flight = returnToDock(flight, 'manual')
  if (guest) {
    const position = sampleRemoteBalloon(ride.leader)
    if (!shared?.aboard || !shared.party?.passengers[ride.owner] || !position) {
      if (!shared?.party?.passengers[ride.owner]) useLocalBalloon.setState({ ticketId: '' })
      cancelLocalBalloon()
      return
    }
    flight = { ...flight, position }
  } else {
    const dt = Math.min(.1, elapsed)
    if (flight.phase === 'flying' && emptySeconds !== null) {
      flight = stepUncrewedFlight(flight, emptySeconds > 0, dt, ride.map)
    } else {
      flight = stepFlight(flight.fallSpeed ? { ...flight, fallSpeed: undefined } : flight, flightInput, dt, ride.map, elapsed)
    }
  }
  const walking = flight.phase === 'flying' && walkingInside
  const stand = !role && ride.cabin.seatIndex >= 0 && occupiedBalloonSeats(ride).includes(ride.cabin.seatIndex)
  const pose = role ? cockpitPose(role) : stand ? toggleCabinSeat(ride.cabin) : ride.cabin
  const cabin = walking ? walkCabin(pose, cabinInput, elapsed) : pose.moving ? { ...pose, moving: false } : pose
  const guestMoved = guest && walking && (!lastGuestPose || cabin.x !== lastGuestPose.x
    || cabin.z !== lastGuestPose.z || cabin.seatIndex !== lastGuestPose.seatIndex || cabin.moving !== lastGuestPose.moving)
  if (ride.ticketId && flight.phase !== 'removed' && (!guest || guestMoved || role) && now - lastPoseAt >= POSE_INTERVAL_MS) {
    lastPoseAt = now
    if (guest) lastGuestPose = cabin
    parkRuntime.sendBalloonPose(ride.ticketId, flight.position, flight.phase !== 'landed', cabin,
      flight.phase === 'flying' ? localInput : stoppedFlightInput)
  }
  if (flight.phase === 'removed' && flight.landing === 'field') {
    if (ride.ticketId) parkRuntime.endBalloon(ride.ticketId)
    useLocalBalloon.setState({ flight: null, ticketId: '', revealSeconds: FIELD_RETURN_FADE_SECONDS })
  } else if (flight.phase === 'removed') cancelLocalBalloon()
  else useLocalBalloon.setState({ flight, cabin, walkingInside, controlRole: role, emptySeconds,
    cabinFirstPerson: roleChanged ? false : ride.cabinFirstPerson })
  return flight.phase === 'flying' ? flightInput : stoppedFlightInput
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
