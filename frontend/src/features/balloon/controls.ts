import type { Input } from './flight'

export type ControlMode = 'solo' | 'split'
export type ControlRole = 'direction' | 'altitude'
export type ControlAction = { action: 'claim' | 'leave' | 'return'; role: ControlRole }
  | { action: 'offer'; role: ControlRole; peer: string }
  | { action: 'accept'; role: ControlRole; offerId: string }

export type BalloonControls = {
  mode: ControlMode
  direction: string | null
  altitude: string | null
  emptyMillis: number | null
  offer: { id: string; role: ControlRole; from: string; to: string } | null
  input: Input
  returning: boolean
}

export const stoppedFlightInput: Input = { x: 0, z: 0, lift: 0 }

export function roleOf(controls: BalloonControls | null | undefined, id: string): ControlRole | null {
  if (controls?.direction === id) return 'direction'
  return controls?.altitude === id ? 'altitude' : null
}

export function inputForRole(mode: ControlMode, role: ControlRole | null, input: Input): Input {
  if (!role) return stoppedFlightInput
  if (mode === 'solo') return input
  return role === 'direction' ? { x: input.x, z: input.z, lift: 0 } : { x: 0, z: 0, lift: input.lift }
}

export function combineFlightInput(controls: BalloonControls, host: string, local: Input): Input {
  const direction = controls.direction === host ? local : controls.input
  const liftRider = controls.mode === 'solo' ? controls.direction : controls.altitude
  const vertical = liftRider === host ? local : controls.input
  return { x: controls.direction ? direction.x : 0, z: controls.direction ? direction.z : 0,
    lift: liftRider ? vertical.lift : 0 }
}
