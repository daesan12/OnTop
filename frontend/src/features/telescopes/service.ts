import type { TelescopeService } from './contracts'
import { MockTelescopeService } from './mock/MockTelescopeService'
import { parkRuntime } from '../../park/runtime/runtime'
import { serverFacilities } from '../facilities/state'

export const telescopeService: TelescopeService = !serverFacilities ? new MockTelescopeService() : {
  mode: 'server',
  async enter(_context, id, signal) {
    const lease = await parkRuntime.useFacility(id, 0, signal)
    return { leaseId: lease.leaseId, grantId: lease.leaseId, userId: lease.userId, channelId: lease.channelId,
      telescopeId: lease.facilityId, pose: lease.pose, exit: lease.exit, yaw: lease.yaw, pitch: lease.pitch }
  },
  async aim(lease, aim, signal) { return parkRuntime.aimFacility(lease.leaseId ?? lease.grantId, aim, signal) },
  async leave(lease, signal) { await parkRuntime.releaseFacility(lease.leaseId ?? lease.grantId, signal) },
}
