import type { Pose } from '../../network/worldClient'
import type { BenchSeat } from './benchAnchors'

export interface BenchContext {
  channelId: string
  userId: string
  position: Pose
}
export interface BenchLease {
  leaseId?: string
  exit?: Pose
  channelId: string
  userId: string
  benchId: string
  seat: BenchSeat
  pose: Pose
}
/** FE-only port. Approved backend commands/DTOs must be mapped here later. */
export interface BenchService {
  readonly mode: 'server' | 'mock' | 'unavailable'
  sit(context: BenchContext, benchId: string, seat: BenchSeat, signal: AbortSignal): Promise<BenchLease>
  stand(lease: BenchLease, signal: AbortSignal): Promise<void>
}
