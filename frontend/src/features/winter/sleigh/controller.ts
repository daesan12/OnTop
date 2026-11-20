import { estimatedServerTime, useSession } from '../../../network/worldClient'
import { parkRuntime } from '../../../park/runtime/runtime'
import { RENEWAL_PARK_ENABLED } from '../../../park/mapSelection'
import { useFacilityState } from '../../facilities/state'
import { sleighPose } from './route'

export function sleighRider(userId: string) {
  if (!RENEWAL_PARK_ENABLED) return null
  const lease = useFacilityState.getState().occupancies[userId]
  return lease?.kind === 'SLEIGH' && lease.channelId === useSession.getState().roomId
    ? sleighPose(estimatedServerTime() - Date.parse(lease.startedAt)) : null
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
