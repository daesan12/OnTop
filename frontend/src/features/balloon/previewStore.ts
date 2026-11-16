import { create } from 'zustand'
import {
  BALLOON_FARE, CAPACITY, WAIT_SECONDS, createFlight, returnToDock, stepFlight, takeOff,
} from './flight'
import type { Flight, Input, Point } from './flight'
import { canBoard, flightMap, moveWalker, startPoint } from './previewMap'
import { cabinCamera, resetCabinCamera } from './cabinCamera'
import { cameraRelativeMove } from '../../network/movementInput'

const options = new URLSearchParams(window.location.search)
function numberOption(key: string, fallback: number, maximum: number) {
  const value = options.get(key)
  if (value === null || !/^\d+$/.test(value)) return fallback
  return Math.min(maximum, Number(value))
}

const passengerRequested = options.get('role') === 'passenger'
const guestCount = numberOption('guests', passengerRequested ? 2 : 0, CAPACITY)
export const isPassenger = passengerRequested && guestCount > 0
export const keys = new Set<string>()
export const cameraDrag = { yaw: 0 }
const neutral = { x: 0, z: 0, lift: 0 }
const steering = { dx: 0, dz: 0, run: false, jump: false }

type Popup = 'board' | 'balance' | 'cancelled' | null
type Preview = {
  flight: Flight
  walker: Point
  popup: Popup
  coins: number
  boarded: boolean
  wait: number
  start: () => void
  open: () => void
  close: () => void
  board: () => void
  cancel: () => void
  reset: () => void
  losePilot: () => void
  tick: (dt: number, elapsed: number) => void
}

export function occupancy(boarded: boolean) {
  return guestCount + Number(boarded)
}

function axis(positive: string, negative: string) {
  return Number(keys.has(positive)) - Number(keys.has(negative))
}

function horizontalInput() {
  return {
    x: Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft')),
    z: Number(keys.has('KeyS') || keys.has('ArrowDown')) - Number(keys.has('KeyW') || keys.has('ArrowUp')),
  }
}

function pilotFlightInput(): Input {
  const { x: side, z: back } = horizontalInput()
  const { dx, dz } = cameraRelativeMove(-back, side, cabinCamera.yaw, false, false, steering)
  return { x: dx, z: dz, lift: Number(keys.has('Space')) - Number(keys.has('ShiftLeft') || keys.has('ShiftRight')) }
}

export const usePreview = create<Preview>((set, get) => ({
  flight: createFlight(flightMap), walker: startPoint, popup: null,
  coins: numberOption('coins', BALLOON_FARE, 999), boarded: false, wait: 0,

  start() {
    const { flight, boarded, coins } = get()
    if (flight.phase !== 'boarding' || !boarded) return
    keys.clear()
    cameraDrag.yaw = 0
    resetCabinCamera()
    set({ flight: takeOff(flight), coins: coins - BALLOON_FARE, wait: 0 })
  },

  open() {
    const { flight, walker, boarded, popup } = get()
    if (flight.phase !== 'boarding' || boarded || popup || !canBoard(walker)) return
    keys.clear()
    set({ popup: 'board' })
  },

  close() {
    set({ popup: null })
  },

  board() {
    const { popup, boarded, coins } = get()
    if (popup !== 'board' || boarded || occupancy(false) === CAPACITY) return
    if (coins < BALLOON_FARE) {
      set({ popup: 'balance' })
      return
    }
    set({ boarded: true, wait: WAIT_SECONDS, popup: null })
  },

  cancel() {
    const { flight, boarded } = get()
    if (flight.phase !== 'boarding' || !boarded) return
    keys.clear()
    set({ boarded: false, wait: 0, popup: 'cancelled' })
  },

  reset() {
    if (get().flight.phase !== 'removed') return
    keys.clear()
    cameraDrag.yaw = 0
    set({ flight: createFlight(flightMap), walker: startPoint, boarded: false })
  },

  losePilot() {
    set(({ flight }) => ({ flight: returnToDock(flight, 'pilot') }))
  },

  tick(dt, elapsed) {
    const { flight, walker, popup, boarded, wait, start } = get()
    if (flight.phase === 'boarding' && boarded) {
      const remaining = Math.max(0, wait - elapsed)
      if (remaining === 0) start()
      else set({ wait: remaining })
      return
    }
    if (flight.phase === 'boarding' || flight.phase === 'landed' || flight.phase === 'removed') {
      const { x: dx, z: dz } = horizontalInput()
      if (!popup && (dx || dz)) {
        const distance = 6 * dt / Math.hypot(dx, dz)
        set({ walker: moveWalker(walker, dx * distance, dz * distance) })
      }
    }
    if (flight.phase === 'boarding' || flight.phase === 'removed') return

    if (isPassenger && flight.phase === 'flying') {
      cameraDrag.yaw += axis('ArrowLeft', 'ArrowRight') * dt * 1.6
    }
    const input = flight.phase === 'flying'
      ? isPassenger
        ? { x: -.5, z: -.4, lift: 0 }
        : pilotFlightInput()
      : neutral
    const next = stepFlight(flight, input, dt, flightMap, elapsed)
    if (next.phase === 'landed' && next.exit && flight.phase !== 'landed') {
      keys.clear()
      set({ flight: next, walker: next.exit, boarded: false })
    } else {
      set({ flight: next })
    }
  },
}))
