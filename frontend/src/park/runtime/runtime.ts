import { ParkRuntime } from './SpringParkRuntime'
import type { ParkRuntimePort } from './contracts'

export const parkRuntime: ParkRuntimePort = new ParkRuntime()

// Preserve existing imports while keeping the Spring transport behind the FE command port.
export { ParkRuntime, ServerError, avatars, validateChat } from './SpringParkRuntime'

let leases = 0,
  cleanup: ReturnType<typeof setTimeout> | undefined
export function acquireRuntime(onAuthEnded: () => void) {
  clearTimeout(cleanup)
  ++leases
  const unlisten = parkRuntime.addAuthListener(onAuthEnded)
  parkRuntime.start()
  return () => {
    unlisten()
    if (--leases === 0)
      cleanup = setTimeout(() => {
        if (!leases) void parkRuntime.stop()
      }, 0)
  }
}
