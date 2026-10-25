import type { FollowLink, FollowScope } from './state'
import { createPreviewFollowService } from './previewService'

/** FE command port only. BE must approve a transport, request and authoritative relationship stream. */
export interface FollowService {
  mode: 'unavailable' | 'server' | 'preview'
  start(scope: FollowScope, targetId: string, signal: AbortSignal): Promise<readonly FollowLink[]>
  stop(scope: FollowScope, signal: AbortSignal): Promise<readonly FollowLink[]>
}
const unavailable = async (): Promise<readonly FollowLink[]> => { throw new Error('따라가기 서버 연결이 준비 중이에요.') }
export const followService: FollowService = import.meta.env.DEV && import.meta.env.MODE === 'facility-preview'
  ? createPreviewFollowService() : { mode: 'unavailable', start: unavailable, stop: unavailable }
