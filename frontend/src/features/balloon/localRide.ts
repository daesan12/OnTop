import { create } from 'zustand'
import { BALLOON_SCALE } from '../../../park-renewal-preview/plan'
import { useSession } from '../../network/worldClient'
import { BALLOON_RIDE_ENABLED } from '../../park/mapSelection'
import { clearRoamingInput, inputState } from '../../world/inputOwnership'
import { createFlight, returnToDock, stepFlight, takeOff, WAIT_SECONDS } from './flight'
import type { Flight, FlightMap, Input, Point } from './flight'

type LocalRide = {
  owner: string
  room: string
  panel: 'closed' | 'loading' | 'board' | 'error'
  map: FlightMap | null
  flight: Flight | null
  untilDeparture: number
}

const idle: LocalRide = { owner: '', room: '', panel: 'closed', map: null, flight: null, untilDeparture: 0 }
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

export function boardLocalBalloon() {
  const ride = useLocalBalloon.getState()
  if (ride.panel !== 'board' || !ride.map || !ownsRide(ride)) return
  useLocalBalloon.setState({ panel: 'closed', flight: createFlight(ride.map), untilDeparture: WAIT_SECONDS })
}

export function startLocalBalloon() {
  const ride = useLocalBalloon.getState()
  if (ride.flight?.phase !== 'boarding' || !ownsRide(ride)) return
  clearRoamingInput()
  useLocalBalloon.setState({ flight: takeOff(ride.flight), untilDeparture: 0 })
}

export function returnLocalBalloon() {
  const ride = useLocalBalloon.getState()
  if (!ride.flight) return
  useLocalBalloon.setState({ flight: returnToDock(ride.flight, 'manual') })
}

export function tickLocalBalloon(input: Input, elapsed: number) {
  const ride = useLocalBalloon.getState()
  if (!ride.flight || !ride.map || !ownsRide(ride)) return
  if (ride.flight.phase === 'boarding') {
    const untilDeparture = Math.max(0, ride.untilDeparture - elapsed)
    if (untilDeparture === 0) startLocalBalloon()
    else useLocalBalloon.setState({ untilDeparture })
    return
  }
  const flight = stepFlight(ride.flight, input, Math.min(.1, elapsed), ride.map, elapsed)
  if (flight.phase === 'removed') cancelLocalBalloon()
  else useLocalBalloon.setState({ flight })
}

export function localBalloonRider(id: string): Point | null {
  if (!BALLOON_RIDE_ENABLED) return null
  const { owner, flight } = useLocalBalloon.getState()
  if (!flight || owner !== id) return null
  if (flight.phase === 'landed') return flight.exit ?? null
  return { ...flight.position, y: flight.position.y + .425 * BALLOON_SCALE }
}

export function watchLocalBalloonSession() {
  return useSession.subscribe((session, previous) => {
    if (!inputState.localBalloon) return
    if (session.sessionId === previous.sessionId && session.roomId === previous.roomId
      && session.status === previous.status && session.mapCompatible === previous.mapCompatible) return
    if (!ownsRide(useLocalBalloon.getState())) cancelLocalBalloon()
  })
}
