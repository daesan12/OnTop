export interface WatchTarget { scope: string; gameId: string }
type WatchStatus = 'idle' | 'starting' | 'watching' | 'switching' | 'error'
interface WatchDependencies {
  start(target: WatchTarget): Promise<void>
  stop(target: WatchTarget): Promise<void>
  hide(): void
  status(status: WatchStatus, error?: string): void
}
const key = (target: WatchTarget | null) => target ? JSON.stringify([target.scope, target.gameId]) : ''

/** Owns one public subscription. Invalidation hides immediately and cancels even a pending GAME_WATCH.
 * No retry loop on denial/timeout; a changed public ID or an explicit retry is required. */
export class PublicGameWatcher {
  private desired: WatchTarget | null = null
  private server: { target: WatchTarget; promise: Promise<boolean>; failed: boolean } | null = null
  private releasing: Promise<boolean> | null = null
  private blocked: string | null = null
  private epoch = 0
  constructor(private readonly deps: WatchDependencies) {}
  accepts(gameId: unknown) {
    return !this.releasing && !!this.server && key(this.server.target) === key(this.desired)
      && !this.server.failed && gameId === this.desired?.gameId
  }
  set(target: WatchTarget | null, retry = false): Promise<boolean> {
    if (key(target) !== key(this.desired) || retry) this.blocked = null
    this.desired = target ? { ...target } : null
    return this.pump()
  }
  reset() {
    this.epoch++; this.desired = this.server = this.releasing = null; this.blocked = null
  }
  revoked(message: string) {
    this.deps.hide(); this.server = null; this.blocked = key(this.desired)
    this.deps.status('error', message)
  }
  private pump(): Promise<boolean> {
    if (this.releasing) return this.releasing.then(ok => ok ? this.pump() : false)
    if (this.blocked === key(this.desired)) return Promise.resolve(false)
    const server = this.server
    if (server && (key(server.target) !== key(this.desired) || server.failed && this.blocked !== key(this.desired)))
      return this.release(server).then(ok => ok ? this.pump() : false)
    if (!this.desired) { this.deps.status('idle'); return Promise.resolve(true) }
    if (server) return server.promise
    const epoch = this.epoch, target = { ...this.desired }
    const operation = { target, failed: false, promise: Promise.resolve(false) }
    this.server = operation
    this.deps.status('starting')
    operation.promise = this.deps.start(target).then(() => {
      if (epoch !== this.epoch || this.server !== operation || key(this.desired) !== key(target) || this.releasing) return false
      this.deps.status('watching'); return true
    }).catch(cause => {
      if (epoch !== this.epoch || this.server !== operation || key(this.desired) !== key(target) || this.releasing) return false
      operation.failed = true; this.blocked = key(target); this.deps.hide()
      this.deps.status('error', cause instanceof Error ? cause.message : '경기 관전을 확인하지 못했어요.')
      return false
    })
    return operation.promise
  }
  private release(server: NonNullable<PublicGameWatcher['server']>) {
    const epoch = this.epoch
    this.deps.hide(); this.deps.status('switching')
    const task = this.deps.stop(server.target).then(() => true).catch(cause => {
      // The backend explicitly confirms that no subscription remains.
      if (cause && typeof cause === 'object' && 'code' in cause && cause.code === 'GAME_NOT_WATCHING') return true
      if (epoch === this.epoch) {
        this.blocked = key(this.desired)
        this.deps.status('error', '이전 경기 관전 종료를 확인하지 못했어요. 다시 연결해주세요.')
      }
      return false
    }).then(ok => {
      if (epoch !== this.epoch) return false
      if (ok && this.server === server) this.server = null
      else if (!ok) server.failed = true
      return ok
    }).finally(() => { if (epoch === this.epoch && this.releasing === task) this.releasing = null })
    this.releasing = task
    return task
  }
}
