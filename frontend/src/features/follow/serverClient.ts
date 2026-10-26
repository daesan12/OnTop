import { record, type Envelope } from '../../network/protocol'
import { ServerError } from '../../network/socketClient'
import type { FollowService } from './service'
import { acceptFollowState, resetFollow, sameFollowScope, useFollow, type FollowLink, type FollowScope } from './state'

interface Connection extends FollowScope { generation: number; connected: boolean }
interface Dependencies {
  scope(): Connection
  request(type: string, payload: Record<string, unknown>, expected: string[], onId: (id: string) => void): Promise<Envelope>
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function parseFollowState(p: Record<string, unknown>) {
  if (typeof p.channelId !== 'string' || !p.channelId || !Number.isSafeInteger(p.version) || Number(p.version) < 0
    || !Array.isArray(p.links) || p.links.length > 64) throw new Error('따라가기 상태 형식을 확인하지 못했어요.')
  const followers = new Set<string>(), ids = new Set<string>()
  const links = p.links.map((link): FollowLink => {
    if (!record(link) || typeof link.followId !== 'string' || !uuid.test(link.followId)
      || typeof link.followerId !== 'string' || !link.followerId || typeof link.targetId !== 'string' || !link.targetId
      || link.followerId === link.targetId || followers.has(link.followerId) || ids.has(link.followId))
      throw new Error('따라가기 관계 형식을 확인하지 못했어요.')
    followers.add(link.followerId); ids.add(link.followId)
    return { followId: link.followId, followerId: link.followerId, targetId: link.targetId }
  })
  return { channelId: p.channelId, version: Number(p.version), links }
}

/** Full snapshots only. Movement and automatic release remain server authoritative. */
export class FollowClient implements FollowService {
  readonly mode = 'server' as const
  private epoch = 0
  private requests = new Map<string, { epoch: number; scope: Connection }>()
  constructor(private deps: Dependencies) {}
  reset() { ++this.epoch; resetFollow() }
  begin = async () => { this.reset(); await this.check() }
  private current(scope: Connection, epoch: number) {
    const next = this.deps.scope()
    return epoch === this.epoch && next.connected && next.generation === scope.generation && sameFollowScope(scope, next)
  }
  ownsError(message: Envelope) {
    return message.type === 'ERROR' && !!message.requestId && this.requests.has(message.requestId)
  }
  accept(message: Envelope) {
    if (message.type !== 'WORLD_FOLLOW_STATE') return
    const request = message.requestId ? this.requests.get(message.requestId) : undefined
    if (message.requestId && !request) return
    const scope = this.deps.scope()
    if (!scope.connected || request && !this.current(request.scope, request.epoch) || message.payload.channelId !== scope.channelId) return
    try {
      const next = parseFollowState(message.payload), state = useFollow.getState()
      if (sameFollowScope(state.scope, scope) && next.version < state.version) return
      acceptFollowState(scope, next.links)
      useFollow.setState({ version: next.version, ready: true })
    } catch (cause) {
      useFollow.setState({ ready: false, error: cause instanceof Error ? cause.message : '따라가기 상태를 확인해주세요.' })
    }
  }
  private async send(type: string, payload: Record<string, unknown>, scope: Connection, epoch: number) {
    const response = await this.deps.request(type, payload, ['WORLD_FOLLOW_STATE'], id => {
      this.requests.set(id, { scope, epoch })
      if (this.requests.size > 128) this.requests.delete(this.requests.keys().next().value!)
    })
    if (!this.current(scope, epoch)) throw new Error('따라가기 연결이 변경되었어요.')
    const next = parseFollowState(response.payload)
    if (next.channelId !== scope.channelId) throw new Error('따라가기 채널을 확인해주세요.')
    this.accept(response) // Same-version ACKs resolve too; older ACKs cannot overwrite a newer push.
    return useFollow.getState().links
  }
  check = async () => {
    const scope = this.deps.scope(), epoch = this.epoch
    if (!scope.connected || !scope.channelId || useFollow.getState().checking) return
    useFollow.setState({ checking: true, ready: false, error: '' })
    try { await this.send('WORLD_FOLLOW_CHECK', {}, scope, epoch) }
    catch (cause) {
      if (this.current(scope, epoch)) useFollow.setState({ ready: false, error: '따라가기 상태를 확인하지 못했어요. 다시 조회해주세요.' })
      throw cause
    } finally { if (this.current(scope, epoch)) useFollow.setState({ checking: false }) }
  }
  start = (scope: FollowScope, targetId: string, signal: AbortSignal) => this.command(scope, 'WORLD_FOLLOW_START', { targetId }, signal)
  stop = (scope: FollowScope, signal: AbortSignal) => {
    const link = useFollow.getState().links.find(link => link.followerId === scope.userId)
    if (!link?.followId) return Promise.reject(new Error('따라가기 상태를 다시 조회해주세요.'))
    return this.command(scope, 'WORLD_FOLLOW_STOP', { followId: link.followId }, signal)
  }
  private async command(scope: FollowScope, type: string, payload: Record<string, unknown>, signal: AbortSignal) {
    const connection = this.deps.scope(), epoch = this.epoch, state = useFollow.getState()
    if (signal.aborted || !connection.connected || !sameFollowScope(scope, connection) || !sameFollowScope(state.scope, scope)
      || !state.ready || state.checking) throw new Error('따라가기 상태를 먼저 조회해주세요.')
    try { return await this.send(type, payload, connection, epoch) }
    catch (cause) {
      // An uncertain command is never replayed. Query the latest relationship instead.
      if (!signal.aborted && this.current(connection, epoch) && (!(cause instanceof ServerError) || cause.code === 'FOLLOW_LINK_MISMATCH'))
        await this.check().catch(() => {})
      throw cause
    }
  }
}
