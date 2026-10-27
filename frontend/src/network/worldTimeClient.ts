import type { Envelope } from './protocol'
import { record, integer } from './protocol'
import { environmentClock, environmentConfig, resetEnvironmentTime } from '../world/environmentState'

export interface WorldTimeSample {
  serverNow: number
  cycleEpochMs: number
  cycleDurationMs: number
  timeZone: 'Asia/Seoul'
}
export function parseWorldTime(value: unknown): WorldTimeSample {
  if (!record(value) || !integer(value.serverNow) || value.serverNow <= 0
    || !integer(value.cycleEpochMs) || !integer(value.cycleDurationMs) || value.cycleDurationMs <= 0
    || value.timeZone !== 'Asia/Seoul') throw new Error('서버 월드 시간 형식이 올바르지 않습니다.')
  return { serverNow: value.serverNow, cycleEpochMs: value.cycleEpochMs,
    cycleDurationMs: value.cycleDurationMs, timeZone: value.timeZone }
}

interface Dependencies {
  request(type: string, payload: Record<string, unknown>, expected: readonly string[], onId: (id: string) => void): Promise<Envelope>
  now?: () => number
}

/** One authenticated SharedSocket, monotonic RTT, no JSON heartbeat or extra socket.
 * Clock failures keep the KST fallback/last valid sample and do not block roaming.
 */
export class WorldTimeClient {
  private epoch = 0
  private loading: Promise<void> | undefined
  private ids = new Set<string>()
  private timer: ReturnType<typeof setInterval> | undefined
  private listening = false
  private enabled = false
  private measured = false
  private visibilityRevision = 0
  error = ''
  private now: () => number
  constructor(private readonly deps: Dependencies) { this.now = deps.now ?? (() => performance.now()) }
  ownsError(message: Envelope) {
    return message.type === 'ERROR' && message.requestId !== null && this.ids.has(message.requestId)
  }
  private visible = () => typeof document === 'undefined' || !document.hidden
  private visibility = () => {
    // Do not reuse a request whose delivery crossed a background-tab suspension.
    ++this.visibilityRevision
    this.loading = undefined
    if (this.visible()) void this.refresh()
  }
  begin(initial?: unknown) {
    this.reset()
    this.enabled = true
    if (initial !== undefined) {
      try { this.apply(parseWorldTime(initial), this.now()) }
      catch (error) { this.error = (error as Error).message }
    }
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('visibilitychange', this.visibility)
      this.listening = true
    }
    this.timer = setInterval(() => { if (this.visible()) void this.refresh() }, 30_000)
    if (this.visible()) void this.refresh()
  }
  reset() {
    ++this.epoch
    this.enabled = this.measured = false
    clearInterval(this.timer)
    this.timer = undefined
    if (this.listening) document.removeEventListener('visibilitychange', this.visibility)
    this.listening = false
    this.loading = undefined
    this.ids.clear()
    this.error = ''
    resetEnvironmentTime()
  }
  private apply(sample: WorldTimeSample, at: number, rtt?: number) {
    // Once RTT has been measured, only correlated requests can update the clock.
    if (this.measured && rtt === undefined) return
    if (!environmentClock.sync(sample.serverNow, at, rtt)) return
    Object.assign(environmentConfig, { epochMs: sample.cycleEpochMs,
      dayDurationMs: sample.cycleDurationMs, timeZone: sample.timeZone })
    if (rtt !== undefined) this.measured = true
    this.error = ''
  }
  refresh(): Promise<void> {
    if (!this.enabled || !this.visible()) return Promise.resolve()
    if (this.loading) return this.loading
    const epoch = this.epoch, revision = this.visibilityRevision, before = this.now()
    const task = (async () => {
      try {
        const response = await this.deps.request('WORLD_TIME_CHECK', {}, ['WORLD_TIME_STATE'], id => {
          this.ids.add(id)
          if (this.ids.size > 128) this.ids.delete(this.ids.values().next().value!)
        })
        if (epoch !== this.epoch || revision !== this.visibilityRevision || !this.enabled || !this.visible()) return
        const after = this.now()
        this.apply(parseWorldTime(response.payload), after, Math.max(0, after - before))
      } catch (error) {
        if (epoch === this.epoch && revision === this.visibilityRevision)
          this.error = error instanceof Error ? error.message : '서버 시간을 확인하지 못했습니다.'
      }
    })()
    this.loading = task
    void task.finally(() => { if (this.loading === task) this.loading = undefined })
    return task
  }
}
