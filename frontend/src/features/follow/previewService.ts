import type { FollowService } from './service'

/** FOLLOW_PREVIEW_ONLY: relationship/rope UI only. Never simulates server movement or changes world positions. */
export function createPreviewFollowService(): FollowService {
  return { mode: 'preview',
    async start(scope, targetId, signal) {
      if (signal.aborted) throw new Error('FOLLOW_PREVIEW_ONLY: 미리보기가 취소되었습니다.')
      return [{ followerId: scope.userId, targetId }]
    },
    async stop(_scope, signal) {
      if (signal.aborted) throw new Error('FOLLOW_PREVIEW_ONLY: 미리보기가 취소되었습니다.')
      return []
    },
  }
}
