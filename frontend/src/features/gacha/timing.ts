import { EnvironmentClock } from '../../config/environment'
import type { GachaMachine } from './contracts'

// HTTP serverNow is the shared DB clock. Device wall-clock changes do not restart a refill.
export const gachaClock = new EnvironmentClock()
export function refillRemaining(machine: GachaMachine | null | undefined, mono = performance.now()) {
  if (!machine?.refillEndsAt) return 0
  if (!gachaClock.ready) return 3000 // Keep DRAW closed until the authenticated GET supplies a clock sample.
  return Math.max(0, Date.parse(machine.refillEndsAt) - gachaClock.now(mono))
}
