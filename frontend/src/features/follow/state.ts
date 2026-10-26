import { create } from 'zustand'

export interface FollowScope { userId: string; channelId: string }
export interface FollowLink { followId?: string; followerId: string; targetId: string }
export const sameFollowScope = (a: FollowScope | null, b: FollowScope) => a?.userId === b.userId && a.channelId === b.channelId
const initial = () => ({ scope: null as FollowScope | null, links: [] as readonly FollowLink[], pending: false, error: '', epoch: 0,
  version: -1, ready: false, checking: false })
export const useFollow = create(initial)
let lifetime = new AbortController()
export const followSignal = () => lifetime.signal
export function resetFollow() {
  lifetime.abort(); lifetime = new AbortController()
  useFollow.setState({ ...initial(), epoch: useFollow.getState().epoch + 1 }, true)
}
/** Internal adapter seam, not a wire DTO. Only a server-approved snapshot (or explicit preview) calls this. */
export function acceptFollowState(scope: FollowScope, links: readonly FollowLink[]) {
  if (!scope.userId || !scope.channelId || links.length > 64) return false
  const ids = new Set<string>()
  for (const link of links) {
    if (!link.followerId || !link.targetId || link.followerId === link.targetId || ids.has(link.followerId)) return false
    ids.add(link.followerId)
  }
  useFollow.setState({ scope: { ...scope }, links: links.map(link => ({ ...link })), error: '' })
  return true
}
