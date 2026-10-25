import type { BenchService } from './benchContracts'
import { MockBenchService } from './mock/MockBenchService'
import { parkRuntime } from '../../park/runtime/runtime'
import { serverFacilities } from '../facilities/state'

export const benchService: BenchService = !serverFacilities ? new MockBenchService() : {
  mode: 'server',
  async sit(_context, benchId, seat, signal) {
    const lease = await parkRuntime.useFacility(benchId, seat, signal)
    return { leaseId: lease.leaseId, channelId: lease.channelId, userId: lease.userId,
      benchId: lease.facilityId, seat: lease.seatIndex as 0 | 1, pose: lease.pose, exit: lease.exit }
  },
  async stand(lease, signal) {
    if (!lease.leaseId) throw new Error('현재 벤치 이용 식별자를 확인해주세요.')
    await parkRuntime.releaseFacility(lease.leaseId, signal)
  },
}
