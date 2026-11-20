import { estimatedServerTime, useSession } from '../../../network/worldClient'
import { parkRuntime } from '../../../park/runtime/runtime'
import { RENEWAL_PARK_ENABLED } from '../../../park/mapSelection'
import { useFacilityState } from '../../facilities/state'
import { sleighChassisPose } from './formation'
import { createSleighClock } from './flightClock'
import type { FacilityLease } from '../../facilities/protocol'

const flightClock = createSleighClock()
export function sleighElapsed(lease: FacilityLease) {
  return flightClock(lease.leaseId, lease.startedAt, estimatedServerTime(), performance.now())
}

export function sleighRider(userId: string) {
  if (!RENEWAL_PARK_ENABLED) return null
  const lease = useFacilityState.getState().occupancies[userId]
  return lease?.kind === 'SLEIGH' && lease.channelId === useSession.getState().roomId
    ? sleighChassisPose(sleighElapsed(lease)) : null
}
export async function boardSleigh(id: string) {
  try {
    parkRuntime.stopMovement()
    await parkRuntime.useFacility(id, 0, new AbortController().signal)
    return true
  } catch {
    // FacilityClient reconciles rejected/ambiguous requests and exposes the server error.
    return false
  }
}
