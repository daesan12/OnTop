export const CAPACITY = 4
export const PREVIEW_FARE = 10
export const WAIT_SECONDS = 12
export const FLIGHT_SECONDS = 90
export const REMOVE_SECONDS = 5

export const BORDER_MARGIN = 8
export const WARNING_MARGIN = 17
export const MAX_ALTITUDE = 72
const CRUISE_HEIGHT = 54
const TAKEOFF_RISE = 10

export type Point = { x: number; y: number; z: number }
export type Input = { x: number; z: number; lift: number }
export type FlightMap = {
  dock: Point
  dockExit: Point
  inside(x: number, z: number, margin: number): boolean
  floor(x: number, z: number): number
  landing(x: number, z: number): { position: Point; exit: Point } | null
}
export type Flight = {
  phase: 'boarding' | 'takeoff' | 'flying' | 'returning' | 'landed' | 'removed'
  position: Point
  seconds: number
  atBoundary: boolean
  returnReason?: 'time' | 'pilot' | 'terrain'
  landing?: 'dock' | 'field'
  exit?: Point
}

export function createFlight(map: FlightMap): Flight {
  return { phase: 'boarding', position: map.dock, seconds: 0, atBoundary: false }
}

export function takeOff(flight: Flight): Flight {
  if (flight.phase !== 'boarding') return flight
  return { ...flight, phase: 'takeoff', seconds: FLIGHT_SECONDS }
}

export function returnToDock(flight: Flight, reason: NonNullable<Flight['returnReason']>): Flight {
  if (flight.phase !== 'flying' && flight.phase !== 'takeoff') return flight
  return { ...flight, phase: 'returning', atBoundary: false, returnReason: reason }
}

function approach(value: number, target: number, step: number) {
  return value + Math.sign(target - value) * Math.min(step, Math.abs(target - value))
}

function land(flight: Flight, position: Point, exit: Point, landing: 'dock' | 'field'): Flight {
  return { ...flight, phase: 'landed', position, exit, seconds: REMOVE_SECONDS, atBoundary: false, landing }
}

export function stepFlight(flight: Flight, input: Input, dt: number, map: FlightMap, elapsed = dt): Flight {
  const { phase, position: { x, y, z } } = flight
  const dock = map.dock
  const seconds = Math.max(0, flight.seconds - elapsed)
  if (phase === 'takeoff') {
    const target = dock.y + TAKEOFF_RISE
    const altitude = approach(y, target, 4 * dt)
    return { ...flight, phase: altitude === target ? 'flying' : phase, position: { x, y: altitude, z }, seconds }
  }
  if (phase === 'flying') {
    if (seconds === 0) return returnToDock({ ...flight, seconds }, 'time')
    const magnitude = Math.max(1, Math.hypot(input.x, input.z))
    const vx = input.x * 10 * dt / magnitude, vz = input.z * 10 * dt / magnitude
    const inward = (x + vx) ** 2 + (z + vz) ** 2 < x ** 2 + z ** 2
    const speed = !inward && !map.inside(x, z, WARNING_MARGIN) ? .45 : 1
    const candidateX = x + vx * speed, candidateZ = z + vz * speed
    const nextX = map.inside(candidateX, z, BORDER_MARGIN) ? candidateX : x
    const nextZ = map.inside(nextX, candidateZ, BORDER_MARGIN) ? candidateZ : z
    const floor = map.floor(nextX, nextZ)
    const altitude = Math.min(MAX_ALTITUDE, y + input.lift * 4 * dt)
    if (altitude <= floor + .12) {
      if (input.lift < 0 && y >= floor - .6) {
        const landing = map.landing(nextX, nextZ)
        if (landing) return land(flight, landing.position, landing.exit, 'field')
      }
      return returnToDock(flight, 'terrain')
    }
    return {
      ...flight, position: { x: nextX, y: altitude, z: nextZ }, seconds,
      atBoundary: !map.inside(nextX, nextZ, WARNING_MARGIN),
    }
  }
  if (phase === 'returning') {
    const distance = Math.hypot(dock.x - x, dock.z - z)
    if (distance > 0 && y < CRUISE_HEIGHT) {
      return { ...flight, position: { x, y: approach(y, CRUISE_HEIGHT, 8 * dt), z } }
    }
    if (distance > 0) {
      const progress = Math.min(1, 17 * dt / distance)
      const position = progress === 1 ? { ...dock, y } : { x: x + (dock.x - x) * progress, y, z: z + (dock.z - z) * progress }
      return { ...flight, position }
    }
    const altitude = approach(y, dock.y, 7 * dt)
    if (altitude === dock.y) return land(flight, dock, map.dockExit, 'dock')
    return { ...flight, position: { x, y: altitude, z } }
  }
  if (phase === 'landed') return { ...flight, phase: seconds === 0 ? 'removed' : phase, seconds }
  return flight
}
