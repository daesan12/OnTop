import { estimatedServerTime, useSession } from '../../../network/worldClient'
import { RENEWAL_PARK_ENABLED } from '../../../park/mapSelection'
import { useFacilityState } from '../../facilities/state'
import { sleighChassisPose } from './formation'
import { createSleighClock } from './flightClock'
import type { FacilityLease } from '../../facilities/protocol'
export { boardSleigh } from './boarding'

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
