import { TELESCOPE } from '../../../config'
import { canReachTelescope, findTelescope, normalizeTelescopeAim, telescopeAnchors } from '../anchors'
import type { TelescopeAim, TelescopeContext, TelescopeLease, TelescopeService } from '../contracts'

/** M06_TELESCOPE_MOCK_ONLY: one page's occupancy/aim authority; no auth, network or physics. */
export class MockTelescopeService implements TelescopeService {
  readonly mode = 'mock' as const
  private serial = 0
  private occupied = new Map<string, { lease: TelescopeLease; cleanup(): void }>()
  constructor(private readonly delayMs = 180) {}
  private wait(signal: AbortSignal, delay = this.delayMs) {
    return new Promise<void>((resolve, reject) => {
      if (signal.aborted) { reject(new Error('망원경 목업 요청이 취소되었습니다.')); return }
      const abort = () => { clearTimeout(timer); reject(new Error('망원경 목업 요청이 취소되었습니다.')) }
      const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, delay)
      signal.addEventListener('abort', abort, { once: true })
    })
  }
  private key(channelId: string, id: string) { return JSON.stringify([channelId, id]) }
  private owner(lease: TelescopeLease) {
    const entry = this.occupied.get(this.key(lease.channelId, lease.telescopeId))
    if (!entry || entry.lease.grantId !== lease.grantId || entry.lease.userId !== lease.userId)
      throw new Error('망원경 이용 상태가 변경되었습니다.')
    return entry
  }
  async enter(context: TelescopeContext, id: string, signal: AbortSignal) {
    await this.wait(signal)
    if (signal.aborted) throw new Error('망원경 목업 요청이 취소되었습니다.')
    if (!context.userId || !context.channelId || !canReachTelescope(context.position, id))
      throw new Error('전망대 정상의 망원경 가까이 같은 높이로 이동해주세요.')
    const key = this.key(context.channelId, id)
    if (this.occupied.has(key)) throw new Error('다른 이웃이 먼저 이용했습니다.')
    if ([...this.occupied.values()].some(({ lease }) => lease.channelId === context.channelId && lease.userId === context.userId))
      throw new Error('먼저 현재 망원경에서 나와주세요.')
    const anchors = telescopeAnchors(id)
    const lease: TelescopeLease = { grantId: String(++this.serial), userId: context.userId, channelId: context.channelId,
      telescopeId: id, pose: anchors.use, exit: anchors.exit, yaw: findTelescope(id)!.yaw, pitch: TELESCOPE.initialPitch }
    const release = () => {
      if (this.occupied.get(key)?.lease.grantId === lease.grantId) this.occupied.delete(key)
      signal.removeEventListener('abort', release)
    }
    this.occupied.set(key, { lease, cleanup: release })
    signal.addEventListener('abort', release, { once: true })
    return lease
  }
  async aim(lease: TelescopeLease, aim: TelescopeAim, signal: AbortSignal) {
    await this.wait(signal, Math.min(40, this.delayMs))
    if (signal.aborted) throw new Error('망원경 목업 요청이 취소되었습니다.')
    const entry = this.owner(lease), approved = normalizeTelescopeAim(aim.yaw, aim.pitch)
    entry.lease = { ...entry.lease, ...approved }
    return approved
  }
  async leave(lease: TelescopeLease, signal: AbortSignal) {
    await this.wait(signal)
    if (signal.aborted) throw new Error('망원경 목업 요청이 취소되었습니다.')
    this.owner(lease).cleanup()
  }
}
