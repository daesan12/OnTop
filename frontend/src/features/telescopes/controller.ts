import { TELESCOPE } from '../../config'
import { tableBusy } from '../../game/store'
import { avatars, authoritativePose, cancelAvatarEmote, refreshActivityPresentation, useSession } from '../../network/worldClient'
import { parkRuntime } from '../../park/runtime/runtime'
import { clearRoamingInput, panelOwnsKeys } from '../../world/inputOwnership'
import { useBenchState } from '../interactions/benchState'
import { useFitnessState } from '../fitness/state'
import { telescopeView } from '../telescopeView'
import { canReachTelescope, normalizeTelescopeAim } from './anchors'
import { telescopeService } from './service'
import { releaseTelescopeUser, telescopeSignal, useTelescopeState } from './state'

export async function enterTelescope(id: string): Promise<boolean> {
  const session = useSession.getState(), state = useTelescopeState.getState(), avatar = avatars.get(session.sessionId)
  if (session.status !== 'connected' || !session.mapCompatible || !avatar?.connected || session.pending || state.pending
    || useBenchState.getState().pending || useFitnessState.getState().pending || tableBusy() || panelOwnsKeys()
    || session.tableId || avatar.seatIndex >= 0 || avatar.fitnessId || avatar.telescopeId || avatar.swimming
    || !canReachTelescope(avatar.current, id)) return false
  parkRuntime.move(0, 0, false)
  clearRoamingInput()
  useTelescopeState.setState({ pending: true, operation: 'enter', error: '' })
  const signal = telescopeSignal(session.sessionId), epoch = state.epoch
  try {
    const lease = await telescopeService.enter({ userId: session.sessionId, channelId: session.roomId, position: { ...avatar.current } }, id, signal)
    if (signal.aborted || useTelescopeState.getState().epoch !== epoch) return false
    const current = useSession.getState(), position = authoritativePose(session.sessionId), a = avatars.get(session.sessionId)
    if (current.sessionId !== session.sessionId || current.roomId !== session.roomId || current.status !== 'connected'
      || !current.mapCompatible || current.tableId || current.benchId || current.fitnessId || tableBusy()
      || useBenchState.getState().pending || useFitnessState.getState().pending
      || !a?.connected || a.seatIndex >= 0 || a.fitnessId || a.telescopeId || a.swimming || !position || !canReachTelescope(position, id)) {
      releaseTelescopeUser(session.sessionId)
      useTelescopeState.setState({ error: '위치나 이용 상태가 바뀌었습니다. 정상의 망원경 가까이에서 다시 시도해주세요.' })
      return false
    }
    useTelescopeState.setState(s => ({ placements: { ...s.placements, [session.sessionId]: lease } }))
    cancelAvatarEmote(session.sessionId)
    refreshActivityPresentation()
    return true
  } catch (error) {
    if (!signal.aborted && useTelescopeState.getState().epoch === epoch)
      useTelescopeState.setState({ error: error instanceof Error ? error.message : '망원경을 이용하지 못했습니다.' })
    return false
  } finally {
    if (useTelescopeState.getState().epoch === epoch) useTelescopeState.setState({ pending: false, operation: '' })
  }
}
export async function leaveTelescope(): Promise<boolean> {
  const session = useSession.getState(), state = useTelescopeState.getState(), lease = state.placements[session.sessionId]
  if (session.status !== 'connected' || !lease || state.pending) return false
  const signal = telescopeSignal(session.sessionId), epoch = state.epoch
  clearRoamingInput()
  useTelescopeState.setState({ pending: true, operation: 'leave', error: '' })
  try {
    await telescopeService.leave(lease, signal)
    if (signal.aborted || useTelescopeState.getState().epoch !== epoch) return false
    releaseTelescopeUser(session.sessionId)
    refreshActivityPresentation() // Restore actual Spring approach position, not the proposed exit anchor.
    return true
  } catch (error) {
    if (!signal.aborted && useTelescopeState.getState().epoch === epoch)
      useTelescopeState.setState({ error: error instanceof Error ? error.message : '망원경에서 나오지 못했습니다.' })
    return false
  } finally {
    if (useTelescopeState.getState().epoch === epoch) useTelescopeState.setState({ pending: false, operation: '' })
  }
}
let lastAim = { epoch: -1, grantId: '', at: -Infinity }
let pendingAim: { epoch: number } | undefined
export async function aimTelescope(yaw = telescopeView.yaw, pitch = telescopeView.pitch): Promise<boolean> {
  const session = useSession.getState(), state = useTelescopeState.getState(), lease = state.placements[session.sessionId]
  if (!lease || state.pending || session.status !== 'connected' || !session.mapCompatible || panelOwnsKeys()
    || (pendingAim?.epoch === state.epoch) || !Number.isFinite(yaw) || !Number.isFinite(pitch)) return false
  const aim = normalizeTelescopeAim(yaw, pitch), now = Date.now()
  if ((lease.yaw === aim.yaw && lease.pitch === aim.pitch)
    || (lastAim.epoch === state.epoch && lastAim.grantId === lease.grantId && now - lastAim.at < TELESCOPE.aimIntervalMs)) return false
  lastAim = { epoch: state.epoch, grantId: lease.grantId, at: now }
  const request = { epoch: state.epoch }, signal = telescopeSignal(session.sessionId)
  pendingAim = request
  try {
    const approved = await telescopeService.aim(lease, aim, signal)
    const current = useSession.getState(), latest = useTelescopeState.getState()
    if (signal.aborted || latest.epoch !== state.epoch || latest.pending || current.sessionId !== session.sessionId
      || current.roomId !== session.roomId || latest.placements[session.sessionId]?.grantId !== lease.grantId) return false
    const direction = normalizeTelescopeAim(approved.yaw, approved.pitch)
    useTelescopeState.setState(s => ({ placements: { ...s.placements, [session.sessionId]: { ...lease, ...direction } }, error: '' }))
    refreshActivityPresentation()
    return true
  } catch (error) {
    if (!signal.aborted && useTelescopeState.getState().epoch === state.epoch)
      useTelescopeState.setState({ error: error instanceof Error ? error.message : '망원경 방향을 반영하지 못했습니다.' })
    return false
  } finally { if (pendingAim === request) pendingAim = undefined }
}
