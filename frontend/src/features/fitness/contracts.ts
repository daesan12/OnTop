import type { Pose } from '../../network/worldClient'

export interface FitnessContext { userId: string; channelId: string; position: Pose }
export interface FitnessLease {
  userId: string
  channelId: string
  stationId: string
  startedAt: number
  pose: Pose
  exit: Pose
}
/** Frontend port, not proposed Spring commands or wire DTOs. */
export interface FitnessService {
  readonly mode: 'mock' | 'unavailable'
  enter(context: FitnessContext, stationId: string, signal: AbortSignal): Promise<FitnessLease>
  leave(lease: FitnessLease, signal: AbortSignal): Promise<void>
}
