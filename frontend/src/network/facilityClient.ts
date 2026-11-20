import { SLEIGH_ID } from '../features/winter/sleigh/route'
import { RENEWAL_PARK_ENABLED } from '../park/mapSelection'
import { BENCH_IDS, DUCK_BOAT, FITNESS_STATIONS, TELESCOPES } from '../park/mapConfig'
import { EXPECTED_MAP_VERSION } from '../park/mapConfig'
import { clearRoamingInput } from '../world/inputOwnership'
import { parseFacilityCatalogPage, parseFacilitySnapshot, type FacilityLease, type FacilityKind } from '../features/facilities/protocol'
import { resetFacilities, useFacilityState } from '../features/facilities/state'
import type { Envelope } from './protocol'

interface Scope { generation: number; channelId: string; userId: string; connected: boolean }
interface Dependencies {
  mapVersion?(): string
  scope(): Scope
  request(type: string, payload: Record<string, unknown>, expected: readonly string[], onId: (id: string) => void): Promise<Envelope>
  apply(leases: readonly FacilityLease[]): void
  blockMovement(): void
}
const expectedKinds = new Map<string, FacilityKind>([
  ...(RENEWAL_PARK_ENABLED ? [[SLEIGH_ID, 'SLEIGH'] as const] : []),
  ...BENCH_IDS.map(id => [id, 'BENCH'] as const),
  ...FITNESS_STATIONS.map(s => [s.id, 'FITNESS'] as const),
  ...TELESCOPES.map(t => [t.id, 'TELESCOPE'] as const),
  ...(DUCK_BOAT ? [[DUCK_BOAT.id, 'BOAT'] as const] : []),
])
export type BoatCommand = 'WORLD_BOAT_JOIN' | 'WORLD_BOAT_REPLY' | 'WORLD_BOAT_TEAM'
const cancelled = () => new Error('시설 연결이나 채널이 바뀌었습니다. 현재 상태를 다시 확인해주세요.')
const errorText = (e: unknown) => e instanceof Error ? e.message : '시설 상태를 확인하지 못했습니다.'

/** Uses the existing SharedSocket only. A snapshot never supplies authoritative world coordinates. */
export class FacilityClient {
  private epoch = 0
  private scope: Scope | undefined
  private ids = new Set<string>()
  private facilityIds = new Set<string>()
  private transitionId = ''
  private worldVersion = -1
  private worldRevision = 0
  private awaitAfter: number | undefined
  private waiters = new Set<() => void>()
  private loading: Promise<void> | undefined
  private operation = false
  private aimAt = -Infinity
  private aimSeq = 0
  private aimLease = ''
  private aimPending: Promise<{ yaw: number; pitch: number }> | undefined
  private transitions = 0
  constructor(private readonly deps: Dependencies) {}
  // Facility failures belong to the facility UI, including delayed replies from a retired scope.
  ownsError(message: Envelope) {
    return message.type === 'ERROR' && message.requestId !== null && this.facilityIds.has(message.requestId)
  }
  reset() {
    ++this.epoch; this.scope = undefined; this.ids.clear(); this.transitionId = ''
    this.worldVersion = -1; this.worldRevision = 0; this.awaitAfter = undefined
    this.loading = undefined; this.operation = false; this.aimLease = ''; this.aimSeq = 0; this.aimAt = -Infinity
    this.aimPending = undefined; this.transitions = 0
    resetFacilities(); this.deps.apply([])
    for (const wake of [...this.waiters]) wake()
  }
  begin() {
    this.reset()
    const scope = this.deps.scope()
    if (!scope.connected || !scope.channelId || !scope.userId) return Promise.resolve()
    this.scope = { ...scope }
    useFacilityState.setState({ channelId: scope.channelId })
    return this.refresh(true)
  }
  private current(epoch = this.epoch) {
    const s = this.deps.scope(), own = this.scope
    return epoch === this.epoch && !!own && s.connected && s.generation === own.generation
      && s.channelId === own.channelId && s.userId === own.userId
  }
  private async request(type: string, payload: Record<string, unknown>, transition = false) {
    const epoch = this.epoch
    if (!this.current(epoch)) throw cancelled()
    let id = ''
    try {
      const result = await this.deps.request(type, payload,
        [type === 'WORLD_FACILITY_CATALOG' ? type : 'WORLD_FACILITY_STATE'], requestId => {
          this.ids.add(id = requestId)
          this.facilityIds.add(requestId)
          if (this.facilityIds.size > 512) this.facilityIds.delete(this.facilityIds.values().next().value!)
          if (transition) { this.transitionId = requestId; ++this.transitions }
        })
      if (!this.current(epoch)) throw cancelled()
      if (result.type === 'WORLD_FACILITY_STATE' && !this.accept(result))
        throw new Error('시설 상태를 다시 확인해주세요.')
      return result
    } finally { this.ids.delete(id); if (this.transitionId === id) this.transitionId = '' }
  }
  refresh(reloadCatalog = false): Promise<void> {
    if (this.loading) return this.loading
    const epoch = this.epoch
    const task = this.synchronize(reloadCatalog, epoch)
    this.loading = task
    void task.finally(() => { if (this.loading === task) this.loading = undefined }).catch(() => {})
    return task
  }
  private async synchronize(reloadCatalog: boolean, epoch: number) {
    if (!this.current(epoch)) throw cancelled()
    useFacilityState.setState({ loading: true, ready: false, error: '' })
    try {
      if (reloadCatalog || !useFacilityState.getState().options) {
        const catalog: ReturnType<typeof useFacilityState.getState>['catalog'] = {}
        let offset = 0, first: ReturnType<typeof parseFacilityCatalogPage> | undefined
        for (let pages = 0; ; pages++) {
          if (pages > 100) throw new Error('시설 목록 페이지가 올바르지 않습니다.')
          const page = parseFacilityCatalogPage((await this.request('WORLD_FACILITY_CATALOG', offset ? { offset } : {})).payload,this.deps.mapVersion?.() ?? EXPECTED_MAP_VERSION)
          if (!this.current(epoch)) throw cancelled()
          first ??= page
          if (page.offset !== offset || page.total !== first.total || page.aimIntervalMs !== first.aimIntervalMs
            || page.minPitch !== first.minPitch || page.maxPitch !== first.maxPitch || page.initialPitch !== first.initialPitch)
            throw new Error('시설 목록이 조회 중 변경되었습니다. 다시 확인해주세요.')
          for (const d of page.facilities) {
            if (catalog[d.facilityId] || expectedKinds.get(d.facilityId) !== d.kind)
              throw new Error('시설 배치와 서버 목록을 확인해주세요.')
            catalog[d.facilityId] = d
          }
          if (page.nextOffset === -1) {
            if (Object.keys(catalog).length !== page.total) throw new Error('시설 목록이 누락되었습니다.')
            break
          }
          if (page.nextOffset !== offset + page.facilities.length || page.nextOffset <= offset || page.nextOffset >= page.total)
            throw new Error('시설 목록 페이지가 올바르지 않습니다.')
          offset = page.nextOffset
        }
        const { mapVersion, aimIntervalMs, minPitch, maxPitch, initialPitch, fitnessRewardsEnabled } = first!
        useFacilityState.setState({ catalog, options: { mapVersion, aimIntervalMs, minPitch, maxPitch, initialPitch, fitnessRewardsEnabled } })
      }
      await this.request('WORLD_FACILITY_CHECK', {})
      if (!this.current(epoch)) throw cancelled()
      useFacilityState.setState({ ready: true, uncertain: this.awaitAfter !== undefined, error: '' })
    } catch (error) {
      if (this.current(epoch)) useFacilityState.setState({ error: errorText(error), ready: false })
      throw error
    } finally { if (this.current(epoch)) useFacilityState.setState({ loading: false }) }
  }
  accept(message: Envelope): boolean {
    if (message.type !== 'WORLD_FACILITY_STATE' || !this.current()
      || (message.requestId !== null && !this.ids.has(message.requestId))
      || message.payload.channelId !== this.scope!.channelId) return false
    try {
      const snapshot = parseFacilitySnapshot(message.payload,this.deps.mapVersion?.() ?? EXPECTED_MAP_VERSION), state = useFacilityState.getState()
      if (snapshot.version < state.version) return true
      if (!state.options) return false // CHECK after the complete catalog obtains the latest full snapshot.
      for (const lease of snapshot.occupancies) {
        const definition = state.catalog[lease.facilityId]
        if (!definition || definition.kind !== lease.kind || lease.seatIndex >= definition.seats.length)
          throw new Error('시설 점유와 목록이 일치하지 않습니다. 상태를 다시 확인해주세요.')
      }
      if (message.requestId === this.transitionId) {
        this.transitionId = ''
        this.awaitAfter = this.worldRevision
        useFacilityState.setState({ awaitingWorld: true })
      }
      if (snapshot.version === state.version) return true
      useFacilityState.setState({ version: snapshot.version, boats: snapshot.boats,
        occupancies: Object.fromEntries(snapshot.occupancies.map(lease => [lease.userId, lease])) })
      this.deps.apply(snapshot.occupancies)
      return true
    } catch (error) {
      useFacilityState.setState({ ready: false, uncertain: true, error: errorText(error) })
      this.deps.blockMovement()
      return false
    }
  }
  world(payload: Record<string, unknown>) {
    if (!this.current() || payload.channelId !== this.scope!.channelId || payload.mapVersion !== (this.deps.mapVersion?.() ?? EXPECTED_MAP_VERSION)
      || typeof payload.version !== 'number' || payload.version <= this.worldVersion || !Array.isArray(payload.avatars)) return
    this.worldVersion = payload.version
    const present = payload.avatars.some(a => a?.userId === this.scope!.userId)
    if (!present) return
    ++this.worldRevision
    if (this.awaitAfter !== undefined && this.worldRevision > this.awaitAfter) {
      this.awaitAfter = undefined
      useFacilityState.setState({ awaitingWorld: false, uncertain: false })
      for (const wake of [...this.waiters]) wake()
    }
  }
  private waitForWorld(epoch: number): Promise<void> {
    if (!this.current(epoch)) return Promise.reject(cancelled())
    if (this.awaitAfter === undefined) return Promise.resolve()
    return new Promise((resolve, reject) => {
      const finish = () => {
        clearTimeout(timer); this.waiters.delete(finish)
        if (!this.current(epoch)) reject(cancelled())
        else if (this.awaitAfter === undefined) resolve()
        else reject(new Error('서버 승인 위치를 기다리고 있습니다. 시설 상태 확인 또는 다시 연결을 이용해주세요.'))
      }
      const timer = setTimeout(finish, 8000)
      this.waiters.add(finish)
    })
  }
  private async act<T>(job: () => Promise<T>, signal: AbortSignal, transition = true, clearInput = true): Promise<T> {
    const epoch = this.epoch, state = useFacilityState.getState()
    if (!this.current(epoch) || signal.aborted) throw cancelled()
    if (!state.ready || state.uncertain || state.awaitingWorld || this.operation)
      throw new Error('시설 상태 확인이 끝난 뒤 다시 시도해주세요.')
    this.operation = true
    if (transition) { this.deps.blockMovement(); if (clearInput) clearRoamingInput() }
    useFacilityState.setState({ pending: true, error: '' })
    const beforeWorld = this.worldRevision
    const beforeTransitions = this.transitions
    try {
      const result = await job()
      await this.waitForWorld(epoch)
      if (!this.current(epoch) || signal.aborted) throw cancelled()
      return result
    } catch (error) {
      if (this.current(epoch) && !signal.aborted) {
        const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
        if (transition && this.transitions > beforeTransitions && (!code || code === 'FACILITY_LEASE_MISMATCH')) {
          this.awaitAfter ??= beforeWorld
          if (this.worldRevision > this.awaitAfter) this.awaitAfter = undefined
          useFacilityState.setState({ uncertain: true, awaitingWorld: this.awaitAfter !== undefined })
        }
        // Reconcile ambiguous delivery and stale leases; never replace rejection with local success.
        if (!code || ['FACILITY_OCCUPIED','FACILITY_LEASE_MISMATCH','FACILITY_STALE_REQUEST',
          'FACILITY_NOT_FOUND','FACILITY_SEAT_INVALID'].includes(code)) {
          await this.refresh(['FACILITY_NOT_FOUND','FACILITY_SEAT_INVALID'].includes(code)).catch(() => {})
        }
        if (this.current(epoch)) useFacilityState.setState({ error: errorText(error) })
      }
      throw error
    } finally {
      if (this.current(epoch)) {
        this.operation = false; useFacilityState.setState({ pending: false })
        if (transition && clearInput) clearRoamingInput()
      }
    }
  }
  use(facilityId: string, seatIndex: number, signal: AbortSignal) {
    return this.act(async () => {
      const state = useFacilityState.getState(), d = state.catalog[facilityId]
      if (!d || !Number.isInteger(seatIndex) || seatIndex < 0 || seatIndex >= d.seats.length)
        throw new Error('시설과 좌석을 확인해주세요.')
      if (state.occupancies[this.scope!.userId]) throw new Error('먼저 현재 시설에서 나와주세요.')
      await this.request('WORLD_FACILITY_USE', { facilityId, seatIndex }, true)
      const lease = useFacilityState.getState().occupancies[this.scope!.userId]
      if (!lease || lease.facilityId !== facilityId || lease.seatIndex !== seatIndex) throw new Error('시설 이용 승인을 확인하지 못했습니다.')
      return lease
    }, signal)
  }
  /** Duck-boat queue/team commands. Joining or accepting moves this player, so it awaits the world update. */
  boat(type: BoatCommand, payload: Record<string, unknown>, signal: AbortSignal) {
    const transition = type === 'WORLD_BOAT_JOIN' || type === 'WORLD_BOAT_REPLY' && payload.accept === true
    return this.act(async () => { await this.request(type, payload, transition) }, signal, transition)
  }
  async release(leaseId: string, signal: AbortSignal) {
    // Finish the one in-flight AIM before RELEASE; exiting must not be lost during a drag.
    await this.aimPending?.catch(() => {})
    return this.act(async () => {
      if (useFacilityState.getState().occupancies[this.scope!.userId]?.leaseId !== leaseId)
        throw new Error('현재 본인의 이용 식별자를 다시 확인해주세요.')
      await this.request('WORLD_FACILITY_RELEASE', { leaseId }, true)
      if (useFacilityState.getState().occupancies[this.scope!.userId]?.leaseId === leaseId)
        throw new Error('시설 반납 승인을 확인하지 못했습니다.')
    }, signal, true, false)
  }
  aim(leaseId: string, aim: { yaw: number; pitch: number }, signal: AbortSignal) {
    if (this.aimPending) return Promise.reject(new Error('망원경 방향 확인 중입니다.'))
    const pending = this.act(async () => {
      const state = useFacilityState.getState(), lease = state.occupancies[this.scope!.userId], options = state.options!
      if (lease?.leaseId !== leaseId || lease.kind !== 'TELESCOPE') throw new Error('현재 망원경 이용 상태를 확인해주세요.')
      if (this.aimLease !== leaseId) { this.aimLease = leaseId; this.aimSeq = lease.lastAimSeq; this.aimAt = -Infinity }
      const now = performance.now()
      if (now - this.aimAt < options.aimIntervalMs) throw new Error('망원경 방향 전송 간격을 확인해주세요.')
      const yaw = Math.atan2(Math.sin(aim.yaw), Math.cos(aim.yaw)), pitch = Math.max(options.minPitch, Math.min(options.maxPitch, aim.pitch))
      if (![yaw, pitch].every(Number.isFinite) || Math.max(this.aimSeq, lease.lastAimSeq) >= 4294967295)
        throw new Error('망원경 방향을 확인해주세요.')
      this.aimSeq = Math.max(this.aimSeq, lease.lastAimSeq) + 1; this.aimAt = now
      await this.request('WORLD_FACILITY_AIM', { leaseId, seq: this.aimSeq, yaw, pitch })
      const approved = useFacilityState.getState().occupancies[this.scope!.userId]
      if (approved?.leaseId !== leaseId || approved.lastAimSeq < this.aimSeq) throw new Error('망원경 방향 승인을 확인하지 못했습니다.')
      // Count the next interval after acknowledgement, so network jitter cannot bunch server arrivals.
      this.aimAt = performance.now()
      return { yaw: approved.yaw, pitch: approved.pitch }
    }, signal, false)
    this.aimPending = pending
    void pending.finally(() => { if (this.aimPending === pending) this.aimPending = undefined }).catch(() => {})
    return pending
  }
}
