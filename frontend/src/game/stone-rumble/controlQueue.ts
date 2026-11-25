import type { StoneControl } from './protocol'

type PendingControl = { input: StoneControl; at: number; resolve: (ok: boolean) => void }
const hasAction = (input: StoneControl) => input.jump || input.fire || input.slide
const MAX_PENDING_ACTIONS = 4
const ACTION_MAX_AGE = 500

/** 이동은 최신값만 남기고, 행동은 누른 순간의 방향과 순서를 보존한다. 전송 중 요청은 하나다. */
export class StoneControlQueue {
  private flying = false
  private scope = ''
  private generation = 0
  private movement: PendingControl | null = null
  private actions: PendingControl[] = []

  constructor(private dispatch: (scope: string, input: StoneControl) => Promise<boolean>,
    private now: () => number = () => performance.now()) {}

  private clear() {
    this.movement?.resolve(false)
    this.movement = null
    for (const action of this.actions) action.resolve(false)
    this.actions = []
  }

  reset() {
    this.generation++
    this.scope = ''
    this.clear()
    // 이미 전송된 요청은 응답을 받을 때까지 같은 회선을 소유한다.
  }

  send(scope: string, input: StoneControl, clearActions = false): Promise<boolean> {
    if (scope !== this.scope) { this.reset(); this.scope = scope }
    if (clearActions) this.clear()
    if (hasAction(input) && this.actions.length >= MAX_PENDING_ACTIONS) return Promise.resolve(false)
    const result = new Promise<boolean>(resolve => {
      const pending = { input: { ...input }, at: this.now(), resolve }
      if (hasAction(input)) {
        // 행동에 더 최신 이동이 포함돼 있다. 예전 seq의 이동을 나중에 전송하지 않는다.
        if (this.movement && this.movement.input.seq <= input.seq) {
          this.movement.resolve(false); this.movement = null
        }
        this.actions.push(pending)
      } else {
        this.movement?.resolve(false)
        this.movement = pending
      }
    })
    this.drain()
    return result
  }

  private drain() {
    if (this.flying) return
    let current = this.actions.shift()
    while (current && this.now() - current.at > ACTION_MAX_AGE) {
      current.resolve(false)
      current = this.actions.shift()
    }
    if (!current) { current = this.movement ?? undefined; this.movement = null }
    if (!current) return
    const scope = this.scope, generation = this.generation, sent = current
    this.flying = true
    let request: Promise<boolean>
    try { request = this.dispatch(scope, sent.input) } catch { request = Promise.resolve(false) }
    void request.catch(() => false).then(ok => {
      sent.resolve(ok)
      // 실패/불확실한 행동을 새 actionId로 재실행하지 않는다.
      if (!ok && generation === this.generation) this.clear()
    }).finally(() => { this.flying = false; this.drain() })
  }
}
