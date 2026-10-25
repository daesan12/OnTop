import type { Pose } from '../../network/worldClient'

export interface TelescopeAim { yaw: number; pitch: number }
export interface TelescopeContext { userId: string; channelId: string; position: Pose }
export interface TelescopeLease extends TelescopeAim {
  leaseId?: string
  grantId: string
  userId: string
  channelId: string
  telescopeId: string
  pose: Pose
  exit: Pose
}
/** FE service port only; Spring routes, commands and DTOs are not defined here. Zoom stays local. */
export interface TelescopeService {
  readonly mode: 'server' | 'mock' | 'unavailable'
  enter(context: TelescopeContext, id: string, signal: AbortSignal): Promise<TelescopeLease>
  aim(lease: TelescopeLease, aim: TelescopeAim, signal: AbortSignal): Promise<TelescopeAim>
  leave(lease: TelescopeLease, signal: AbortSignal): Promise<void>
}
