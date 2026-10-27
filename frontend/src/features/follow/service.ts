import type { FollowLink, FollowScope } from './state'
import { createPreviewFollowService } from './previewService'

/** The shared Spring socket owns production requests; the preview stays isolated. */
export interface FollowService {
  mode: 'unavailable' | 'server' | 'preview'
  start(scope: FollowScope, targetId: string, signal: AbortSignal): Promise<readonly FollowLink[]>
  stop(scope: FollowScope, signal: AbortSignal): Promise<readonly FollowLink[]>
  check?(): Promise<void>
}
let server: FollowService | undefined
export function bindFollowService(service: FollowService) { server = service }
const connected = () => {
  if (!server) throw new Error('따라가기 서버 연결을 확인해주세요.')
  return server
}
export const followService: FollowService = import.meta.env.DEV && import.meta.env.MODE === 'facility-preview'
  ? createPreviewFollowService() : { mode: 'server',
    start: (scope, target, signal) => connected().start(scope, target, signal),
    stop: (scope, signal) => connected().stop(scope, signal),
    check: async () => { await connected().check?.() },
  }
