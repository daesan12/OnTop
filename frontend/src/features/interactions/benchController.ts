import { avatars, authoritativePose, refreshActivityPresentation, useSession } from '../../network/worldClient'
import { tableBusy } from '../../game/store'
import { parkRuntime } from '../../park/runtime/runtime'
import { benchService } from './benchService'
import { benchSignal, resetBenchState, useBenchState } from './benchState'
import { canReachBench, type BenchSeat } from './benchAnchors'
import { useFitnessState } from '../fitness/state'
import { useTelescopeState } from '../telescopes/state'
import { rememberRoamingView } from '../../world/cameraReturn'

const clearInput = () => {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('ontop-clear-input'))
}
export async function sitBench(benchId: string, seat: BenchSeat): Promise<boolean> {
  const session = useSession.getState(), state = useBenchState.getState()
  const avatar = avatars.get(session.sessionId)
  if (session.status !== 'connected' || !session.mapCompatible || !avatar || state.pending || session.pending || useFitnessState.getState().pending || useTelescopeState.getState().pending) return false
  if (session.tableId || avatar.seatIndex >= 0 || avatar.fitnessId || avatar.telescopeId || tableBusy()) return false
  rememberRoamingView(session.sessionId, session.roomId)
  parkRuntime.move(0, 0, false)
  useBenchState.setState({ pending: true, error: '' })
  clearInput()
  const signal = benchSignal(), epoch = state.epoch
  try {
    const lease = await benchService.sit({ channelId: session.roomId, userId: session.sessionId,
      position: { ...avatar.current } }, benchId, seat, signal)
    const current = useSession.getState()
    if (signal.aborted || useBenchState.getState().epoch !== epoch) return false
    if (benchService.mode === 'server') return true
    const position = authoritativePose(session.sessionId)
    if (current.sessionId !== session.sessionId || current.roomId !== session.roomId
      || current.status !== 'connected' || !current.mapCompatible || current.tableId || current.fitnessId || useFitnessState.getState().pending || current.telescopeId || useTelescopeState.getState().pending || tableBusy()
      || !position || !canReachBench(position, benchId)) {
      resetBenchState()
      useBenchState.setState({ error: '위치나 이용 상태가 바뀌었습니다. 벤치 가까이에서 다시 시도해주세요.' })
      return false
    }
    useBenchState.setState(s => ({ placements: { ...s.placements, [session.sessionId]: lease } }))
    refreshActivityPresentation()
    return true
  } catch (error) {
    if (!signal.aborted && useBenchState.getState().epoch === epoch)
      useBenchState.setState({ error: error instanceof Error ? error.message : '벤치에 앉지 못했습니다.' })
    return false
  } finally {
    if (!signal.aborted && useBenchState.getState().epoch === epoch) useBenchState.setState({ pending: false })
  }
}
export async function standBench(): Promise<boolean> {
  const session = useSession.getState(), state = useBenchState.getState()
  const lease = state.placements[session.sessionId]
  if (session.status !== 'connected' || !lease || state.pending) return false
  const signal = benchSignal(), epoch = state.epoch
  useBenchState.setState({ pending: true, error: '' })
  try {
    await benchService.stand(lease, signal)
    if (signal.aborted || useBenchState.getState().epoch !== epoch) return false
    if (benchService.mode === 'server') return true
    const placements = { ...useBenchState.getState().placements }
    delete placements[session.sessionId]
    useBenchState.setState({ placements })
    // A client-only mock cannot teleport the authoritative Spring player.
    // Restore the latest real approach position; exit anchors are supplied for BE integration.
    refreshActivityPresentation()
    return true
  } catch (error) {
    if (!signal.aborted && useBenchState.getState().epoch === epoch)
      useBenchState.setState({ error: error instanceof Error ? error.message : '일어나지 못했습니다.' })
    return false
  } finally {
    if (!signal.aborted && useBenchState.getState().epoch === epoch) useBenchState.setState({ pending: false })
  }
}
