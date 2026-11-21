import type { ControlMode } from './controls'

export const CAPACITY = 4
export const BALLOON_FARE = 100
export const WAIT_SECONDS = 12
export const FLIGHT_SECONDS = 90
export const REMOVE_SECONDS = 5
export const DOCK_REMOVE_SECONDS = 1

export const BORDER_MARGIN = 8
export const WARNING_MARGIN = 17
export const MAX_ALTITUDE = 72
const TAKEOFF_RISE = 10
// Keep desktop return speeds within the server's horizontal and vertical pose limits.
const RETURN_HORIZONTAL_SPEED = 20
const RETURN_VERTICAL_SPEED = 10

export type Point = { x: number; y: number; z: number }
export type BalloonBoarding = { capacity: number; mode?: ControlMode } | { leaderId: string }
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
  returnReason?: 'time' | 'pilot' | 'terrain' | 'manual'
  landing?: 'dock' | 'field'
  exit?: Point
  fallSpeed?: number
  collisionWarning?: boolean
  returnHeight?: number
}

/** 기존 지형/건물 조회로 현재 위치와 진행 방향을 미리 확인한다. 충돌 데이터는 변경하지 않는다. */
export function balloonCollisionWarning(flight: Flight, input: Input, map: FlightMap) {
  if (flight.phase !== 'flying') return false
  const { x, y, z } = flight.position
  const magnitude = Math.max(1, Math.hypot(input.x, input.z))
  const vx = input.x * 10 / magnitude, vz = input.z * 10 / magnitude
  return [0, .5, 1].some(time => y + Math.min(0, input.lift) * 4 * time
    <= map.floor(x + vx * time, z + vz * time) + 3)
}

function safeReturnHeight(flight: Flight, map: FlightMap) {
  const from = flight.position, to = map.dock
  const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / 4))
  let height = Math.max(from.y, to.y + 4)
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    height = Math.max(height, map.floor(from.x + (to.x - from.x) * t, from.z + (to.z - from.z) * t) + 4)
  }
  return height
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

function land(flight: Flight, position: Point, exit: Point, landing: 'dock' | 'field', seconds = REMOVE_SECONDS): Flight {
  return { ...flight, phase: 'landed', position, exit, seconds, atBoundary: false, landing }
}

export function stepUncrewedFlight(flight: Flight, waiting: boolean, dt: number, map: FlightMap): Flight {
  if (waiting) return flight
  const { x, y, z } = flight.position
  const speed = Math.min(8, (flight.fallSpeed ?? 0) + 5 * dt)
  const altitude = y - speed * dt
  const floor = map.floor(x, z)
  if (altitude > floor + .12) return { ...flight, fallSpeed: speed, position: { x, y: altitude, z } }
  const safe = map.landing(x, z)
  return land(flight, safe?.position ?? { x, y, z }, safe?.exit ?? map.dockExit, 'field')
}

const SIGHTSEEING_HEIGHT = 43

export function stepSightseeingFlight(flight: Flight, dt: number, map: FlightMap, elapsed = dt): Flight {
  const { x, y, z } = flight.position
  // Climb above the hill before crossing the park. Ease to a stop over the center.
  const distance = Math.hypot(x, z)
  const fromDock = Math.hypot(x - map.dock.x, z - map.dock.z)
  const speed = y >= SIGHTSEEING_HEIGHT - .15 ? Math.min(.32, .055 + fromDock / 32, distance / 45) : 0
  return stepFlight(flight, {
    x: distance > .1 ? -x / distance * speed : 0,
    z: distance > .1 ? -z / distance * speed : 0,
    lift: Math.max(0, Math.min(.65, (SIGHTSEEING_HEIGHT - y) / 3)),
  }, dt, map, elapsed, true)
}

export function stepFlight(flight: Flight, input: Input, dt: number, map: FlightMap, elapsed = dt, sightseeing = false): Flight {
  const { phase, position: { x, y, z } } = flight
  const dock = map.dock
  const seconds = Math.max(0, flight.seconds - elapsed)
  if (phase === 'takeoff') {
    const target = dock.y + TAKEOFF_RISE
    const altitude = approach(y, target, (sightseeing ? 2.6 : 4) * dt)
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
    const returnHeight = sightseeing ? SIGHTSEEING_HEIGHT : flight.returnHeight ?? safeReturnHeight(flight, map)
    flight = { ...flight, returnHeight, collisionWarning: false }
    if (distance > 0 && y < returnHeight) {
      return { ...flight, position: { x, y: approach(y, returnHeight, (sightseeing ? 2.6 : RETURN_VERTICAL_SPEED) * dt), z } }
    }
    if (distance > 0) {
      const speed = sightseeing ? Math.min(5, Math.max(.6, distance / 2)) : RETURN_HORIZONTAL_SPEED
      const progress = Math.min(1, speed * dt / distance)
      const position = progress === 1 ? { ...dock, y } : { x: x + (dock.x - x) * progress, y, z: z + (dock.z - z) * progress }
      return { ...flight, position }
    }
    const altitude = approach(y, dock.y, (sightseeing ? Math.min(3, Math.max(.5, (y - dock.y) / 2)) : RETURN_VERTICAL_SPEED) * dt)
    if (altitude === dock.y) return land(flight, dock, map.dockExit, 'dock', sightseeing ? REMOVE_SECONDS : DOCK_REMOVE_SECONDS)
    return { ...flight, position: { x, y: altitude, z } }
  }
  if (phase === 'landed') return { ...flight, phase: seconds === 0 ? 'removed' : phase, seconds }
  return flight
}
