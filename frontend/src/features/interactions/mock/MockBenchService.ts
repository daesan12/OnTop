import { canReachBench, findBench, type BenchSeat } from '../benchAnchors'
import type { BenchContext, BenchLease, BenchService } from '../benchContracts'

/** M01_BENCH_MOCK_ONLY: one tab's in-memory facility authority; no transport/auth. */
export class MockBenchService implements BenchService {
  readonly mode = 'mock' as const
  private occupied = new Map<string, { lease: BenchLease; cleanup(): void }>()
  constructor(private readonly delayMs = 180) {}
  private wait(signal: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
      if (signal.aborted) { reject(new Error('벤치 요청이 취소되었습니다.')); return }
      const abort = () => { clearTimeout(timer); reject(new Error('벤치 요청이 취소되었습니다.')) }
      const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, this.delayMs)
      signal.addEventListener('abort', abort, { once: true })
    })
  }
  async sit(context: BenchContext, benchId: string, seat: BenchSeat, signal: AbortSignal) {
    await this.wait(signal)
    if (signal.aborted) throw new Error('벤치 요청이 취소되었습니다.')
    if (!context.userId || !context.channelId || (seat !== 0 && seat !== 1) || !canReachBench(context.position, benchId))
      throw new Error('벤치 가까이 같은 높이로 이동해주세요.')
    const key = JSON.stringify([context.channelId, benchId, seat])
    if (this.occupied.has(key)) throw new Error('다른 이웃이 먼저 앉았습니다.')
    if ([...this.occupied.values()].some(({ lease }) => lease.channelId === context.channelId && lease.userId === context.userId))
      throw new Error('먼저 현재 자리에서 일어나주세요.')
    const lease: BenchLease = { channelId: context.channelId, userId: context.userId, benchId, seat,
      pose: { ...findBench(benchId)!.seats[seat]! } }
    const release = () => {
      if (this.occupied.get(key)?.lease === lease) this.occupied.delete(key)
      signal.removeEventListener('abort', release)
    }
    this.occupied.set(key, { lease, cleanup: release })
    signal.addEventListener('abort', release, { once: true })
    return lease
  }
  async stand(lease: BenchLease, signal: AbortSignal) {
    await this.wait(signal)
    if (signal.aborted) throw new Error('벤치 요청이 취소되었습니다.')
    const key = JSON.stringify([lease.channelId, lease.benchId, lease.seat])
    const own = this.occupied.get(key)
    if (own?.lease !== lease) throw new Error('벤치 이용 상태가 변경되었습니다.')
    own.cleanup()
  }
}
