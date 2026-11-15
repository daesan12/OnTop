import { create } from 'zustand'
import { BALLOON_SCALE } from '../../../park-renewal-preview/plan'
import { authoritativePose, useSession } from '../../network/worldClient'
import { refreshWalletAfterSettlement } from '../wallet/settlementRefresh'
import { BALLOON_RIDE_ENABLED } from '../../park/mapSelection'
import { clearRoamingInput, inputState } from '../../world/inputOwnership'
import { BalloonFareError, buyBalloonTicket, completeBalloonTicket } from './fare'
import { createFlight, REMOVE_SECONDS, returnToDock, stepFlight, takeOff } from './flight'
import type { Flight, FlightMap, Input, Point } from './flight'

type LocalRide = {
  owner: string
  room: string
  panel: 'closed' | 'loading' | 'board' | 'paying' | 'error'
  map: FlightMap | null
  flight: Flight | null
  paymentError: string
  revealSeconds: number
}

const DOCK_STEP_SECONDS = .5
const FIELD_RETURN_FADE_SECONDS = .25
const idle: LocalRide = {
  owner: '', room: '', panel: 'closed', map: null, flight: null, paymentError: '', revealSeconds: 0,
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
  try {
    const ticket = await buyBalloonTicket(ride.owner)
    if (!stillWaiting()) return
    completeBalloonTicket(ride.owner, ticket)
    clearRoamingInput()
    useLocalBalloon.setState({ panel: 'closed', flight: takeOff(createFlight(ride.map)) })
    refreshWalletAfterSettlement(ride.owner, 'balloon:' + ticket)
  } catch (error) {
    if (stillWaiting()) useLocalBalloon.setState({ panel: 'board', paymentError: error instanceof BalloonFareError
      ? error.message : '결제 내역을 확인하지 못했어요. 다시 시도해 주세요.' })
  }
}

export function returnLocalBalloon() {
  const ride = useLocalBalloon.getState()
  if (!ride.flight) return
  useLocalBalloon.setState({ flight: returnToDock(ride.flight, 'manual') })
}

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
  const flight = stepFlight(ride.flight, input, Math.min(.1, elapsed), ride.map, elapsed)
  if (flight.phase === 'removed' && flight.landing === 'field') {
    useLocalBalloon.setState({ flight: null, revealSeconds: FIELD_RETURN_FADE_SECONDS })
  } else if (flight.phase === 'removed') cancelLocalBalloon()
  else useLocalBalloon.setState({ flight })
}

export function localBalloonFade(ride: LocalRide) {
  if (ride.revealSeconds > 0) return ride.revealSeconds / FIELD_RETURN_FADE_SECONDS
  const { flight } = ride
  if (flight?.phase !== 'landed' || flight.landing !== 'field') return 0
  return Math.max(0, 1 - flight.seconds / FIELD_RETURN_FADE_SECONDS)
}

export function localBalloonRider(id: string): Point | null {
  if (!BALLOON_RIDE_ENABLED) return null
  const { owner, flight } = useLocalBalloon.getState()
  if (!flight || owner !== id) return null
  const basket = { ...flight.position, y: flight.position.y + .425 * BALLOON_SCALE }
  if (flight.phase !== 'landed') return basket
  if (flight.landing === 'field') return flight.exit ?? null

  // The server keeps the player on the ground during this local experience.
  const pose = authoritativePose(id)
  if (!pose) return flight.exit ?? null
  const step = Math.min(1, (REMOVE_SECONDS - flight.seconds) / DOCK_STEP_SECONDS)
  const progress = step * step * (3 - 2 * step)
  return {
    x: basket.x + (pose.x - basket.x) * progress,
    y: basket.y + (pose.y - .8 - basket.y) * progress,
    z: basket.z + (pose.z - basket.z) * progress,
  }
}

export function watchLocalBalloonSession() {
  return useSession.subscribe((session, previous) => {
    if (!inputState.localBalloon) return
    if (session.sessionId === previous.sessionId && session.roomId === previous.roomId
      && session.status === previous.status && session.mapCompatible === previous.mapCompatible) return
    if (!ownsRide(useLocalBalloon.getState())) cancelLocalBalloon()
  })
}
