import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FITNESS_STATIONS } from '../../src/config'
import { canReachFitness, fitnessAnchors } from '../../src/features/fitness/anchors'
import { MockFitnessService } from '../../src/features/fitness/mock/MockFitnessService'
import { enterFitness, leaveFitness } from '../../src/features/fitness/controller'
import { fitnessService } from '../../src/features/fitness/service'
import { fitnessSignal, releaseFitnessUser, useFitnessState } from '../../src/features/fitness/state'
import { getParkInteraction } from '../../src/features/interactions/parkInteraction'
import { avatars, authoritativePose, receive, resetWorld, useSession } from '../../src/network/worldClient'
import { EXPECTED_MAP_VERSION } from '../../src/config/mapVersion'
import { inputState, roamingInput } from '../../src/world/inputOwnership'
import { interactionAim } from '../../src/features/interactions/interactionAim'
import { useBenchState } from '../../src/features/interactions/benchState'

vi.mock('../../src/features/fitness/service', async () => {
  const { MockFitnessService } = await import('../../src/features/fitness/mock/MockFitnessService')
  return { fitnessService: new MockFitnessService() }
})

const station = FITNESS_STATIONS[0]!
const near = { x: station.position[0], y: station.position[1] + 0.8, z: station.position[2] + 2.2, yaw: 0 }
const emit = (type: string, payload: Record<string, unknown>) => receive({ type, payload, requestId: null })
function world(version = 1, position = near, users = ['101', '102'], mapVersion = EXPECTED_MAP_VERSION) {
  emit('WORLD_STATE', { channelId: 'a', version, mapVersion, avatars: users.map(userId => ({ userId,
    position: { ...position, lastInputSeq: 0, moving: false, running: false, swimming: false } })) })
}
beforeEach(() => {
  vi.useFakeTimers()
  resetWorld()
  interactionAim.ready = false
  roamingInput.ready = true
  for (const key of Object.keys(inputState) as (keyof typeof inputState)[]) inputState[key] = false
  emit('CONNECTED', { userId: '101' })
  emit('CHANNEL_STATE', { channelId: 'a', name: '공원', version: 1, currentUsers: 2, capacity: 4, userIds: ['101', '102'] })
  world()
})
afterEach(() => { resetWorld(); roamingInput.ready = false; vi.useRealTimers() })
const finish = async <T>(pending: Promise<T>) => { await vi.advanceTimersByTimeAsync(200); return pending }

describe('M05 fitness occupancy and lifecycle', () => {
  it('retains 11 kinds/12 stable anchors, height checks, direction and safe exit offsets', () => {
    expect(FITNESS_STATIONS).toHaveLength(12)
    expect(new Set(FITNESS_STATIONS.map(s => s.kind)).size).toBe(11)
    expect(new Set(FITNESS_STATIONS.map(s => s.id)).size).toBe(12)
    for (const s of FITNESS_STATIONS) {
      const anchors = fitnessAnchors(s.id)
      expect(anchors.use).toMatchObject({ x: s.position[0], y: s.position[1] + s.baseHeight + 0.8, z: s.position[2], yaw: s.yaw })
      expect(Math.hypot(anchors.exit.x - anchors.use.x, anchors.exit.z - anchors.use.z)).toBeCloseTo(2.2)
      expect(canReachFitness(anchors.exit, s.id)).toBe(true)
      expect(canReachFitness({ ...anchors.exit, y: 3 }, s.id)).toBe(false)
      expect(canReachFitness({ ...anchors.exit, x: Infinity }, s.id)).toBe(false)
    }
    expect(canReachFitness(near, 'missing')).toBe(false)
  })
  it('atomically grants one occupant, keeps channels independent, and releases an aborted owner', async () => {
    const service = new MockFitnessService(), a = new AbortController(), b = new AbortController(), c = new AbortController()
    const context = { userId: 'a', channelId: 'x', position: near }
    const first = service.enter(context, station.id, a.signal)
    const second = service.enter({ ...context, userId: 'b' }, station.id, b.signal)
    const rejected = expect(second).rejects.toThrow('먼저 이용')
    await vi.advanceTimersByTimeAsync(200)
    const lease = await first
    await rejected
    const other = await finish(service.enter({ ...context, channelId: 'y' }, station.id, c.signal))
    expect(other.channelId).toBe('y')
    a.abort()
    const replacement = await finish(service.enter({ ...context, userId: 'b' }, station.id, b.signal))
    const stale = expect(service.leave(lease, c.signal)).rejects.toThrow('상태가 변경')
    await vi.advanceTimersByTimeAsync(200)
    await stale
    expect(replacement.userId).toBe('b')
    b.abort(); c.abort()
  })
  it('cancels before approval without occupying a machine and rejects a second activity', async () => {
    const service = new MockFitnessService(), abort = new AbortController(), active = new AbortController()
    const context = { userId: 'a', channelId: 'x', position: near }
    const pending = service.enter(context, station.id, abort.signal)
    const cancelled = expect(pending).rejects.toThrow('취소')
    abort.abort()
    await cancelled
    await finish(service.enter(context, station.id, active.signal))
    const next = FITNESS_STATIONS[1]!, anchors = fitnessAnchors(next.id)
    const duplicate = expect(service.enter({ ...context, position: anchors.exit }, next.id, active.signal)).rejects.toThrow('먼저 현재 기구')
    await vi.advanceTimersByTimeAsync(200); await duplicate
    active.abort()
  })
  it('shares the E target, waits for approval and restores the real approach position on leave', async () => {
    expect(getParkInteraction()).toMatchObject({ kind: 'fitness', id: station.id, occupied: false, available: true })
    const approvedPosition = authoritativePose('101')
    const pending = enterFitness(station.id)
    expect(useFitnessState.getState().pending).toBe(true)
    expect(avatars.get('101')!.fitnessId).toBe('')
    expect(await enterFitness(station.id)).toBe(false)
    expect(await finish(pending)).toBe(true)
    const startedAt = avatars.get('101')!.fitnessStartedAt
    expect(startedAt).toBeGreaterThan(0)
    expect(useSession.getState().fitnessId).toBe(station.id)
    world(2)
    expect(avatars.get('101')!.fitnessStartedAt).toBe(startedAt)
    expect(authoritativePose('101')).toEqual(approvedPosition)
    const leaving = leaveFitness()
    expect(avatars.get('101')!.fitnessId).toBe(station.id)
    expect(await finish(leaving)).toBe(true)
    expect(avatars.get('101')!.current).toEqual(approvedPosition)
    expect(useSession.getState().fitnessId).toBe('')
  })
  it('revalidates the authoritative approach after a delayed approval and frees the rejected lease', async () => {
    const pending = enterFitness(station.id)
    world(2, { ...near, x: near.x + 10 })
    expect(await finish(pending)).toBe(false)
    expect(useFitnessState.getState().placements).toEqual({})
    expect(useFitnessState.getState().error).toContain('위치나 이용 상태')
    const lease = await finish(fitnessService.enter({ channelId: 'a', userId: '102', position: near }, station.id, fitnessSignal('102')))
    expect(lease.stationId).toBe(station.id)
  })
  it('shows an occupied nickname and removes only the departed remote occupant', async () => {
    const lease = await finish(fitnessService.enter({ channelId: 'a', userId: '102', position: near }, station.id, fitnessSignal('102')))
    useFitnessState.setState({ placements: { '102': lease } })
    const { refreshActivityPresentation } = await import('../../src/network/worldClient')
    refreshActivityPresentation()
    expect(getParkInteraction()).toMatchObject({ kind: 'fitness', occupied: true, occupant: '산책자 102' })
    world(2, near, ['101'])
    expect(useFitnessState.getState().placements).toEqual({})
    expect(await finish(enterFitness(station.id))).toBe(true)
  })
  it('preserves an occupied pose after a failed leave, permits retry, and invalidates pending work on map/disconnect', async () => {
    expect(await finish(enterFitness(station.id))).toBe(true)
    const leave = vi.spyOn(fitnessService, 'leave').mockRejectedValueOnce(new Error('반납 실패'))
    expect(await leaveFitness()).toBe(false)
    expect(avatars.get('101')!.fitnessId).toBe(station.id)
    expect(useFitnessState.getState().error).toBe('반납 실패')
    leave.mockRestore()
    expect(await finish(leaveFitness())).toBe(true)
    const pending = enterFitness(station.id)
    world(2, near, ['101', '102'], 'different')
    expect(await finish(pending)).toBe(false)
    expect(useFitnessState.getState().pending).toBe(false)
    world(3)
    const next = enterFitness(station.id)
    resetWorld('reconnecting')
    expect(await finish(next)).toBe(false)
    expect(useFitnessState.getState().placements).toEqual({})
  })
  it('does not start while another facility or a panel owns input', async () => {
    useBenchState.setState({ pending: true })
    expect(await enterFitness(station.id)).toBe(false)
    useBenchState.setState({ pending: false })
    for (const flag of ['chatOpen', 'manualOpen', 'mapOpen', 'emoteWheelOpen', 'minigameOpen'] as const) {
      inputState[flag] = true
      expect(getParkInteraction()).toBeNull()
      inputState[flag] = false
    }
    releaseFitnessUser('101')
  })
})
