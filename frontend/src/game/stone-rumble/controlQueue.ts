import type { StoneControl } from './protocol'

/** One request on the wire, one replaceable snapshot waiting for its acknowledgement. */
export class StoneControlQueue {
  private flying = false
  private scope = ''
  private generation = 0
  private queued: { input: StoneControl; resolve: (ok: boolean) => void } | null = null

  constructor(private dispatch: (scope: string, input: StoneControl) => Promise<boolean>) {}

  reset() {
    this.generation++
    this.scope = ''
    this.queued?.resolve(false)
    this.queued = null
    // An old request still owns the wire until it settles; it cannot be cancelled locally.
  }

  send(scope: string, input: StoneControl, clearActions = false): Promise<boolean> {
    if (scope !== this.scope) { this.reset(); this.scope = scope }
    const previous = this.queued
    const latest = { ...input }
    if (previous && !clearActions) {
      latest.jump ||= previous.input.jump
      latest.fire ||= previous.input.fire
      latest.slide ||= previous.input.slide
    }
    previous?.resolve(false)
    const result = new Promise<boolean>(resolve => { this.queued = { input: latest, resolve } })
    this.drain()
    return result
  }

  private drain() {
    if (this.flying || !this.queued) return
    const current = this.queued, scope = this.scope, generation = this.generation
    this.queued = null
    this.flying = true
    let request: Promise<boolean>
    try { request = this.dispatch(scope, current.input) } catch { request = Promise.resolve(false) }
    void request.catch(() => false).then(ok => {
      current.resolve(ok)
      // Failed/uncertain actions are never replayed with a new actionId.
      if (!ok && generation === this.generation) {
        this.queued?.resolve(false)
        this.queued = null
      }
    }).finally(() => { this.flying = false; this.drain() })
  }
}
