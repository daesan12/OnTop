export const CAPACITY = 4
export const PREVIEW_FARE = 10
export const WAIT_SECONDS = 12
export const FLIGHT_SECONDS = 90
export const REMOVE_SECONDS = 5

export const DOCK = { x: 3.76, y: .67, z: 0 }
export const FLIGHT_LIMIT = 42
export const MAX_ALTITUDE = 25
const BORDER_MARGIN = 6
const CRUISE_HEIGHT = 10

export type Point = { x: number; y: number; z: number }
export type Input = { x: number; z: number; lift: number }
export type Flight = {
  phase: 'boarding' | 'takeoff' | 'flying' | 'returning' | 'landed' | 'removed'
  position: Point
  seconds: number
  atBoundary: boolean
  returnReason?: 'time' | 'pilot'
  landing?: 'dock' | 'field'
}

export function createFlight(): Flight {
  return { phase: 'boarding', position: DOCK, seconds: 0, atBoundary: false }
}

export function takeOff(flight: Flight): Flight {
  if (flight.phase !== 'boarding') return flight
  return { ...flight, phase: 'takeoff', seconds: FLIGHT_SECONDS }
}

export function returnToDock(flight: Flight, reason: 'time' | 'pilot'): Flight {
  if (flight.phase !== 'flying' && flight.phase !== 'takeoff') return flight
  return { ...flight, phase: 'returning', atBoundary: false, returnReason: reason }
}

export function isAtStation(x: number, z: number) {
  return Math.hypot(x, z - 10.6) <= 2.8
}

export function safeExit(flight: Flight): Point {
  if (flight.landing === 'dock') return { x: 0, y: 0, z: 11.8 }
  const { x, z } = flight.position
  return { x: Math.max(-FLIGHT_LIMIT, Math.min(FLIGHT_LIMIT, x + (x > 0 ? -3 : 3))), y: 0, z }
}

function approach(value: number, target: number, step: number) {
  return value + Math.sign(target - value) * Math.min(step, Math.abs(target - value))
}

function moveAxis(value: number, amount: number) {
  const distance = FLIGHT_LIMIT - value * Math.sign(amount)
  const speedFactor = Math.min(1, Math.max(.15, distance / BORDER_MARGIN))
  return Math.max(-FLIGHT_LIMIT, Math.min(FLIGHT_LIMIT, value + amount * speedFactor))
}

function land(flight: Flight, position: Point, landing: 'dock' | 'field'): Flight {
  return { ...flight, phase: 'landed', position, seconds: REMOVE_SECONDS, atBoundary: false, landing }
}

export function stepFlight(flight: Flight, input: Input, dt: number): Flight {
  const { phase, position: { x, y, z } } = flight
  const seconds = Math.max(0, flight.seconds - dt)
  if (phase === 'takeoff') {
    const altitude = approach(y, CRUISE_HEIGHT, 4 * dt)
    return { ...flight, phase: altitude === CRUISE_HEIGHT ? 'flying' : phase, position: { x, y: altitude, z }, seconds }
  }
  if (phase === 'flying') {
    if (seconds === 0) return returnToDock({ ...flight, seconds }, 'time')
    const magnitude = Math.max(1, Math.hypot(input.x, input.z))
    const nextX = moveAxis(x, input.x * 8 * dt / magnitude)
    const nextZ = moveAxis(z, input.z * 8 * dt / magnitude)
    const overStation = Math.hypot(nextX, nextZ) <= 10
    const floor = overStation ? DOCK.y : 0
    const altitude = Math.min(MAX_ALTITUDE, Math.max(floor, y + input.lift * 4 * dt))
    if (input.lift < 0 && altitude === floor) {
      if (overStation) return returnToDock(flight, 'time')
      return land(flight, { x: nextX, y: 0, z: nextZ }, 'field')
    }
    return {
      ...flight, position: { x: nextX, y: altitude, z: nextZ }, seconds,
      atBoundary: Math.max(Math.abs(nextX), Math.abs(nextZ)) >= FLIGHT_LIMIT - BORDER_MARGIN,
    }
  }
  if (phase === 'returning') {
    const distance = Math.hypot(DOCK.x - x, DOCK.z - z)
    if (distance > 0 && y < CRUISE_HEIGHT) {
      return { ...flight, position: { x, y: approach(y, CRUISE_HEIGHT, 6 * dt), z } }
    }
    if (distance > 0) {
      const progress = Math.min(1, 12 * dt / distance)
      const position = progress === 1 ? { ...DOCK, y } : { x: x + (DOCK.x - x) * progress, y, z: z + (DOCK.z - z) * progress }
      return { ...flight, position }
    }
    const altitude = approach(y, DOCK.y, 6 * dt)
    if (altitude === DOCK.y) return land(flight, DOCK, 'dock')
    return { ...flight, position: { x, y: altitude, z } }
  }
  if (phase === 'landed') return { ...flight, phase: seconds === 0 ? 'removed' : phase, seconds }
  return flight
}
