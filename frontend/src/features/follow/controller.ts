import { avatars, useSession } from '../../network/worldClient'
import { facilityMovementBlocked } from '../facilities/state'
import { tableBusy, useGame } from '../../game/store'
import { clearRoamingInput } from '../../world/inputOwnership'
import { acceptFollowState, followSignal, sameFollowScope, useFollow } from './state'
import { followService, type FollowService } from './service'

export function followAvailability(targetId: string): string {
  const s = useSession.getState(), own = avatars.get(s.sessionId), target = avatars.get(targetId)
  if (s.status !== 'connected' || !s.mapCompatible || s.pending || !own?.connected || !target?.connected) return '공원 연결을 확인해주세요.'
  if (targetId === s.sessionId) return '다른 이용자를 선택해주세요.'
  if (own.seatIndex >= 0 || own.fitnessId || own.telescopeId || own.swimming || facilityMovementBlocked(s.sessionId)
    || tableBusy() || useGame.getState().watchedGameId) return '시설·경기 이용을 마친 뒤 따라갈 수 있어요.'
  if (target.seatIndex >= 0 || target.fitnessId || target.telescopeId || target.swimming) return '산책 중인 이용자를 선택해주세요.'
  if (Math.hypot(own.current.x - target.current.x, own.current.z - target.current.z) > 12
    || Math.abs(own.current.y - target.current.y) > 2) return '가까이에 있는 이용자만 따라갈 수 있어요.'
  return ''
}
/** No optimistic relationship or client-authored teleport/automatic movement. */
export async function requestFollow(targetId: string | null, service: FollowService = followService) {
  const session = useSession.getState(), state = useFollow.getState(), signal = followSignal()
  if (state.pending || session.status !== 'connected') return false
  const scope = { userId: session.sessionId, channelId: session.roomId }
  const error = targetId ? followAvailability(targetId) : !sameFollowScope(state.scope, scope) ? '따라가기 상태를 다시 확인해주세요.' : ''
  if (error) { useFollow.setState({ error }); return false }
  clearRoamingInput()
  useFollow.setState({ pending: true, error: '' })
  const current = () => !signal.aborted && useFollow.getState().epoch === state.epoch
    && useSession.getState().status === 'connected' && useSession.getState().sessionId === scope.userId && useSession.getState().roomId === scope.channelId
  try {
    const links = await (targetId ? service.start(scope, targetId, signal) : service.stop(scope, signal))
    if (!current()) return false
    const ownLink = links.find(link => link.followerId === scope.userId)
    if (targetId ? ownLink?.targetId !== targetId : !!ownLink) throw new Error('따라가기 승인 상태를 확인하지 못했어요.')
    if (!acceptFollowState(scope, links)) throw new Error('따라가기 응답을 확인하지 못했어요.')
    return true
  } catch (cause) {
    if (current()) useFollow.setState({ error: cause instanceof Error ? cause.message : '따라가기 요청을 확인하지 못했어요.' })
    return false
  } finally { if (current()) useFollow.setState({ pending: false }) }
}
