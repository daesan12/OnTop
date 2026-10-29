import type { FitnessService } from './contracts'
import { MockFitnessService } from './mock/MockFitnessService'
import { parkRuntime } from '../../park/runtime/runtime'
import { serverFacilities } from '../facilities/state'

export const fitnessService: FitnessService = !serverFacilities ? new MockFitnessService() : {
  mode: 'server',
  async enter(_context, id, signal) {
    const lease = await parkRuntime.useFacility(id, 0, signal)
    return { leaseId: lease.leaseId, userId: lease.userId, channelId: lease.channelId, stationId: lease.facilityId,
      startedAt: Date.parse(lease.startedAt), pose: lease.pose, exit: lease.exit }
  },
  async leave(lease, signal) {
    if (!lease.leaseId) throw new Error('현재 운동기구 이용 식별자를 확인해주세요.')
    await parkRuntime.releaseFacility(lease.leaseId, signal)
  },
}
