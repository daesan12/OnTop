import { avatars, authoritativePose, cancelAvatarEmote, refreshActivityPresentation, useSession } from '../../network/worldClient'
import { tableBusy } from '../../game/store'
import { parkRuntime } from '../../park/runtime/runtime'
import { clearRoamingInput, panelOwnsKeys } from '../../world/inputOwnership'
import { useBenchState } from '../interactions/benchState'
import { canReachFitness } from './anchors'
import { fitnessService } from './service'
import { fitnessSignal, releaseFitnessUser, useFitnessState } from './state'

export async function enterFitness(stationId: string): Promise<boolean> {
  const session = useSession.getState(), state = useFitnessState.getState(), avatar = avatars.get(session.sessionId)
  if (session.status !== 'connected' || !session.mapCompatible || !avatar?.connected || state.pending || session.pending
    || useBenchState.getState().pending || session.tableId || avatar.seatIndex >= 0 || avatar.fitnessId
    || avatar.telescopeId || avatar.swimming || tableBusy() || panelOwnsKeys() || !canReachFitness(avatar.current, stationId)) return false
  parkRuntime.move(0, 0, false)
  clearRoamingInput()
  useFitnessState.setState({ pending: true, operation: 'enter', error: '' })
  const signal = fitnessSignal(session.sessionId), epoch = state.epoch
  try {
    const lease = await fitnessService.enter({ userId: session.sessionId, channelId: session.roomId, position: { ...avatar.current } }, stationId, signal)
    if (signal.aborted || useFitnessState.getState().epoch !== epoch) return false
    const current = useSession.getState(), position = authoritativePose(session.sessionId)
    const currentAvatar = avatars.get(session.sessionId)
    if (current.sessionId !== session.sessionId || current.roomId !== session.roomId || current.status !== 'connected'
      || !current.mapCompatible || current.tableId || current.benchId || useBenchState.getState().pending || tableBusy()
      || !currentAvatar?.connected || currentAvatar.seatIndex >= 0 || currentAvatar.swimming || currentAvatar.telescopeId || !position || !canReachFitness(position, stationId)) {
      releaseFitnessUser(session.sessionId)
      useFitnessState.setState({ error: '위치나 이용 상태가 바뀌었습니다. 기구 가까이에서 다시 시도해주세요.' })
      return false
    }
    useFitnessState.setState(s => ({ placements: { ...s.placements, [session.sessionId]: lease } }))
    cancelAvatarEmote(session.sessionId)
    refreshActivityPresentation()
    return true
  } catch (error) {
    if (!signal.aborted && useFitnessState.getState().epoch === epoch)
      useFitnessState.setState({ error: error instanceof Error ? error.message : '운동기구를 이용하지 못했습니다.' })
    return false
  } finally {
    if (useFitnessState.getState().epoch === epoch) useFitnessState.setState({ pending: false, operation: '' })
  }
}
export async function leaveFitness(): Promise<boolean> {
  const session = useSession.getState(), state = useFitnessState.getState(), lease = state.placements[session.sessionId]
  if (session.status !== 'connected' || !lease || state.pending) return false
  const signal = fitnessSignal(session.sessionId), epoch = state.epoch
  useFitnessState.setState({ pending: true, operation: 'leave', error: '' })
  try {
    await fitnessService.leave(lease, signal)
    if (signal.aborted || useFitnessState.getState().epoch !== epoch) return false
    releaseFitnessUser(session.sessionId)
    // The mock cannot move a real Spring player to the exit anchor.
    refreshActivityPresentation()
    return true
  } catch (error) {
    if (!signal.aborted && useFitnessState.getState().epoch === epoch)
      useFitnessState.setState({ error: error instanceof Error ? error.message : '기구에서 내려오지 못했습니다.' })
    return false
  } finally {
    if (useFitnessState.getState().epoch === epoch) useFitnessState.setState({ pending: false, operation: '' })
  }
}
