import { canReachFitness, fitnessAnchors } from '../anchors'
import type { FitnessContext, FitnessLease, FitnessService } from '../contracts'

/** M05_FITNESS_MOCK_ONLY: one page's occupancy authority, no network/auth/physics. */
export class MockFitnessService implements FitnessService {
  readonly mode = 'mock' as const
  private occupied = new Map<string, { lease: FitnessLease; cleanup(): void }>()
  constructor(private readonly delayMs = 180) {}
  private wait(signal: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
      if (signal.aborted) { reject(new Error('운동기구 목업 요청이 취소되었습니다.')); return }
      const abort = () => { clearTimeout(timer); reject(new Error('운동기구 목업 요청이 취소되었습니다.')) }
      const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, this.delayMs)
      signal.addEventListener('abort', abort, { once: true })
    })
  }
  async enter(context: FitnessContext, stationId: string, signal: AbortSignal) {
    await this.wait(signal)
    if (signal.aborted) throw new Error('운동기구 목업 요청이 취소되었습니다.')
    if (!context.userId || !context.channelId || !canReachFitness(context.position, stationId))
      throw new Error('운동기구 가까이 같은 높이로 이동해주세요.')
    const key = JSON.stringify([context.channelId, stationId])
    if (this.occupied.has(key)) throw new Error('다른 이웃이 먼저 이용했습니다.')
    if ([...this.occupied.values()].some(({ lease }) => lease.channelId === context.channelId && lease.userId === context.userId))
      throw new Error('먼저 현재 기구에서 내려와주세요.')
    const anchors = fitnessAnchors(stationId)
    const lease: FitnessLease = { userId: context.userId, channelId: context.channelId, stationId,
      startedAt: Date.now(), pose: anchors.use, exit: anchors.exit }
    const release = () => {
      if (this.occupied.get(key)?.lease === lease) this.occupied.delete(key)
      signal.removeEventListener('abort', release)
    }
    this.occupied.set(key, { lease, cleanup: release })
    signal.addEventListener('abort', release, { once: true })
    return lease
  }
  async leave(lease: FitnessLease, signal: AbortSignal) {
    await this.wait(signal)
    if (signal.aborted) throw new Error('운동기구 목업 요청이 취소되었습니다.')
    const own = this.occupied.get(JSON.stringify([lease.channelId, lease.stationId]))
    if (own?.lease !== lease) throw new Error('운동기구 이용 상태가 변경되었습니다.')
    own.cleanup()
  }
}
